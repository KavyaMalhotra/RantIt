import express from "express";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import pool from "./config/db.js"; 
import { sendVerificationEmail } from "./config/mailer.js"; 
import session from "express-session";
import passport from "passport";
import "./config/passport.js"; 
import { uniqueNamesGenerator, adjectives, colors, animals } from "unique-names-generator";
import axios from "axios";


const app = express();
const port = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.urlencoded({ extended: true }));


app.use(bodyParser.json());

app.use(session({
    secret: //your Secret key,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

app.use(passport.initialize());
app.use(passport.session());

/* ──────────────────────────────────── */
/* ✅ Generate Unique Alias */
/* ──────────────────────────────────── */
function generateAlias() {
    return uniqueNamesGenerator({
        dictionaries: [adjectives, animals], 
        separator: "_",
        length: 2
    }) + Math.floor(100 + Math.random() * 900);
}


/* ──────────────────────────────────── */
/* ✅ Standard Routes (Home, Register, Login) */
/* ──────────────────────────────────── */
app.get("/", (req, res) => {
    res.render("index", { user: req.session.user || null });
});

app.get("/register", (req, res) => {
    res.render("register", { user: null });
});

app.get("/login", (req, res) => {
    res.render("login", { user: null });
});


/* ──────────────────────────────────── */
/* ✅ Normal Registration & Verification */
/* ──────────────────────────────────── */

app.post("/register", async (req, res) => {
    const { name, email, password } = req.body;
    const alias = generateAlias(); // ✅ Generate alias

    try {
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!emailRegex.test(email)) {
            return res.send(`<script>alert("❌ Invalid email format!"); window.location.href='/register';</script>`);
        }

        const existingUser = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
        if (existingUser.rows.length > 0) {
            return res.send(`<script>alert("❌ Email already registered! Try logging in."); window.location.href='/register';</script>`);
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const verificationToken = crypto.randomBytes(32).toString("hex");

        await pool.query(
            "INSERT INTO users (name, email, password, alias, verified, verification_token) VALUES ($1, $2, $3, $4, $5, $6)",
            [name, email, hashedPassword, alias, false, verificationToken]
        );

        console.log("✅ New User Registered:", { name, email });
        await sendVerificationEmail(email, verificationToken);

        res.send(`<script>alert("✅ Registration Successful! Check your email."); window.location.href='/login';</script>`);

    } catch (err) {
        console.error("❌ Registration Error:", err);
        res.send(`<script>alert("❌ Error during registration."); window.location.href='/register';</script>`);
    }
});

/* ──────────────────────────────────── */
/* ✅ Email Verification Route */
/* ──────────────────────────────────── */

app.get("/verify/:token", async (req, res) => {
    const { token } = req.params;

    try {
        const user = await pool.query("SELECT * FROM users WHERE verification_token = $1", [token]);

        if (user.rows.length === 0) {
            return res.send(`<script>alert("❌ Invalid verification link."); window.location.href='/register';</script>`);
        }

        await pool.query("UPDATE users SET verified = TRUE, verification_token = NULL WHERE verification_token = $1", [token]);
        res.send(`<script>alert("✅ Email Verified!"); window.location.href='/login';</script>`);

    } catch (err) {
        console.error("❌ Verification Error:", err);
        res.send(`<script>alert("❌ Error verifying email."); window.location.href='/register';</script>`);
    }
});

/* ──────────────────────────────────── */
/* ✅ Google OAuth Authentication */
/* ──────────────────────────────────── */

app.get("/auth/google",
    passport.authenticate("google", { scope: ["profile", "email"] })
);

// ✅ Google OAuth Callback
app.get("/auth/google/callback",
    passport.authenticate("google", { failureRedirect: "/register" }),
    async (req, res) => {
        console.log("🔹 Google OAuth Callback Triggered");

        if (!req.user) {
            console.log("❌ Error: No user found in session.");
            return res.redirect("/register");
        }

        const email = req.user.email;

        // ✅ Fetch user with alias
        const existingUser = await pool.query("SELECT * FROM users WHERE email = $1", [email]);

        if (existingUser.rows.length > 0) {
            console.log("✅ Existing User Logged In:", email);
            req.session.user = { 
                id: existingUser.rows[0].id, 
                name: existingUser.rows[0].name, 
                email, 
                alias: existingUser.rows[0].alias  // ✅ Include alias in session
            };
            return res.redirect("/");
        }

        // ✅ If new user, store email in session and redirect to google-setup.ejs
        console.log("🔹 New Google User → Redirecting to google-setup");
        req.session.googleUser = { email };
        return res.render("google-setup", { email });
    }
);

// ✅ Handle Google User Registration (Saving Name & Password)
app.post("/google-setup", async (req, res) => {
    const { name, password } = req.body;
    const email = req.session.googleUser?.email;
    const alias = generateAlias(); // ✅ Generate alias for Google users

    if (!email) {
        return res.redirect("/register");
    }

    try {
        const existingUser = await pool.query("SELECT * FROM users WHERE email = $1", [email]);

        if (existingUser.rows.length > 0) {
            req.session.googleUser = null;
            return res.redirect("/login");
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await pool.query(
            "INSERT INTO users (name, email, password, alias, verified) VALUES ($1, $2, $3, $4, $5)",
            [name, email, hashedPassword, alias, true]
        );

        console.log("✅ Google User Registered:", { name, email });

        req.session.googleUser = null;
        res.redirect("/login");

    } catch (err) {
        console.error("❌ Google Registration Error:", err);
        res.send(`<script>alert("❌ Error during registration."); window.location.href='/google-setup';</script>`);
    }
});

app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    try {
        const userResult = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
        if (userResult.rows.length === 0) {
            return res.send(`<script>alert("❌ User not found."); window.location.href='/login';</script>`);
        }

        const user = userResult.rows[0];
        if (!user.verified) {
            return res.send(`<script>alert("❌ Please verify your email."); window.location.href='/login';</script>`);
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.send(`<script>alert("❌ Incorrect password."); window.location.href='/login';</script>`);
        }

        // ✅ Store alias in session (Important!)
        req.session.user = { 
            id: user.id, 
            name: user.name, 
            email: user.email, 
            alias: user.alias // ✅ Make sure alias is included
        };

        console.log("✅ User Logged In:", req.session.user);
        res.redirect("/");

    } catch (err) {
        console.error("❌ Login Error:", err);
        res.send(`<script>alert("❌ Error during login."); window.location.href='/login';</script>`);
    }
});

/* ──────────────────────────────────── */
/* ✅ Profile page */
/* ──────────────────────────────────── */

app.get("/profile", async (req, res) => {
    if (!req.session.user) {
        return res.redirect("/login"); // Redirect to login if not authenticated
    }

    try {
        // ✅ Fetch user details from DB
        const userResult = await pool.query("SELECT * FROM users WHERE id = $1", [req.session.user.id]);
        const user = userResult.rows[0];

        if (!user) {
            return res.redirect("/login");
        }

        // ✅ Fetch the logged-in user's rants (Include `id`)
        const rantsResult = await pool.query(
            "SELECT id, title, content, tags, created_at FROM rants WHERE user_id = $1 ORDER BY created_at DESC",
            [user.id]
        );
        const rants = rantsResult.rows;

        res.render("profile", { user, rants });

    } catch (err) {
        console.error("❌ Profile Fetch Error:", err);
        res.redirect("/");
    }
});



app.get("/rant", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/login"); // 🔹 Redirect to login if not authenticated
    }

    const flashMessage = req.session.flashMessage || null; // ✅ Retrieve flash message
    req.session.flashMessage = null; // ✅ Clear after displaying

    res.render("rant", { user: req.session.user, flashMessage }); // ✅ Pass flashMessage to EJS
});




app.use(
    session({
        secret: "your_secret_key",
        resave: false,
        saveUninitialized: true,
    })
);

app.post("/post-rant", async (req, res) => {
    try {
        const { title, content, tags } = req.body;
        console.log("Received data:", req.body);

        const userId = req.session.user?.id; // Ensure user is logged in
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized. Please log in." });
        }

        if (!title || !content) {
            return res.status(400).json({ error: "Title and content are required." });
        }

        // 🔹 Step 1: Send title & content to Moderation API (with timeout)
        let moderationResult;
        try {
            const response = await axios.post("http://127.0.0.1:5000/moderate", {
                title,
                content,
            }, { timeout: 5000 }); // ⏳ Timeout after 5s

            moderationResult = response.data;
        } catch (error) {
            console.error("🚨 Moderation API Error:", error.message || error);
            req.session.flashMessage = "Moderation service unavailable. Try again later.";
            return res.redirect("/rant");
        }

        // 🔹 Step 2: Reject rant if moderation flags it
        if (!moderationResult.allowed) {
            console.log("🛑 Moderation Blocked:", moderationResult.reason);
            req.session.flashMessage = `Your rant violates our community guidelines: ${moderationResult.reason || "Not specified"}`;
            return res.redirect("/rant");
        }

        // 🔹 Step 3: Insert the rant into PostgreSQL
        const insertQuery = `
            INSERT INTO rants (user_id, title, content, tags, created_at, updated_at)
            VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING *;
        `;

        const { rows } = await pool.query(insertQuery, [userId, title, content, tags]);

        // 🔹 Step 4: Redirect user to profile page after successful post
        req.session.flashMessage = "Your rant was successfully posted!";
        return res.redirect("/profile");

    } catch (error) {
        console.error("🚨 Error posting rant:", error);
        req.session.flashMessage = "Server error. Please try again later.";
        return res.redirect("/rant");
    }
});



app.get('/thread/:id', async (req, res) => {
    console.log("Route hit! ID:", req.params.id);  // Debug log

    try {
        const rantId = req.params.id;

        // Fetch the rant
        const rantQuery = 'SELECT * FROM rants WHERE id = $1';
        const rantResult = await pool.query(rantQuery, [rantId]);

        if (rantResult.rows.length === 0) {
            console.log("Rant not found:", rantId);
            return res.status(404).send("Rant not found");
        }

        // Fetch replies with user alias
        const repliesQuery = `
            SELECT replies.*, users.alias AS user_alias
            FROM replies
            JOIN users ON replies.user_id = users.id
            WHERE replies.rant_id = $1
            ORDER BY replies.created_at ASC
        `;
        const repliesResult = await pool.query(repliesQuery, [rantId]);

        // Retrieve flash message (if any) and clear it after use
        const flashMessage = req.session.flashMessage || null;
        delete req.session.flashMessage;

        console.log("Rant found, rendering page...");
        res.render('thread', {
            rant: rantResult.rows[0],
            replies: repliesResult.rows,
            user: req.session.user || null,  // ✅ Ensure user is null if logged out
            flashMessage: flashMessage
        });

    } catch (error) {
        console.error('Error fetching rant:', error);
        res.status(500).send("Internal Server Error");
    }
});




app.post("/rant/:rantId/reply", async (req, res) => {
    try {
        const { rantId } = req.params;
        const { content, parent_reply_id } = req.body;
        const userId = req.session.user?.id;

        if (!userId) {
            req.session.flashMessage = "Unauthorized. Please log in.";
            return res.redirect(`/thread/${rantId}`);
        }

        if (!content.trim()) {
            req.session.flashMessage = "Reply content cannot be empty.";
            return res.redirect(`/thread/${rantId}`);
        }

        // 🔹 Step 1: Send the reply content to the Moderation API
        let moderationResult;
        try {
            const response = await axios.post("http://127.0.0.1:5000/moderate", {
                title: "Reply",   // Dummy title (moderation API expects a title)
                content: content, // Content of the reply
                tags: "reply"     // Dummy tag for replies
            }, { timeout: 5000 }); // 5s timeout

            moderationResult = response.data;
        } catch (error) {
            console.error("🚨 Moderation API Error:", error.response?.data || error.message || error);
            req.session.flashMessage = "Moderation service is currently unavailable. Try again later.";
            return res.redirect(`/thread/${rantId}`);
        }

        // 🔹 Step 2: Reject the reply if it is flagged by moderation
        if (!moderationResult.allowed) {
            const violationMessage = moderationResult.reason || "Your reply violates community guidelines.";
            console.log("🛑 Moderation Blocked:", violationMessage);
            req.session.flashMessage = `❌ Reply Not Posted: ${violationMessage}`;
            return res.redirect(`/thread/${rantId}`);
        }

        // 🔹 Step 3: Insert the reply into the database
        const query = `
            INSERT INTO replies (rant_id, user_id, parent_reply_id, content, created_at, updated_at)
            VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING id;
        `;
        const { rows } = await pool.query(query, [rantId, userId, parent_reply_id || null, content]);

        console.log("✅ New Reply Added:", rows[0]);

        // ✅ Set success message and redirect to `/thread/:rantId`
        req.session.flashMessage = "✅ Reply posted successfully!";
        res.redirect(`/thread/${rantId}#reply-${rows[0].id}`);

    } catch (error) {
        console.error("❌ Error posting reply:", error);
        req.session.flashMessage = "Server error. Please try again later.";
        res.redirect(`/thread/${rantId}`);
    }
});







app.get("/edit-rant/:id", async (req, res) => {
    if (!req.session.user) {
        return res.redirect("/login"); // Redirect if not logged in
    }

    try {
        const rantId = req.params.id;
        const userId = req.session.user.id;

        // Fetch the rant from the database
        const result = await pool.query("SELECT * FROM rants WHERE id = $1", [rantId]);

        if (result.rows.length === 0) {
            return res.status(404).send("Rant not found.");
        }

        const rant = result.rows[0];

        // Ensure the logged-in user owns the rant
        if (rant.user_id !== userId) {
            return res.status(403).send("You don't have permission to edit this rant.");
        }

        // Set flashMessage as null initially
        const flashMessage = null;

        // Render the edit page with rant data and an initial null flash message
        res.render("edit-rant", { rant, flashMessage });
    } catch (error) {
        console.error("Error fetching rant for edit:", error);
        res.status(500).send("Internal Server Error");
    }
});


app.post("/update-rant/:id", async (req, res) => {
    try {
        const { title, content, tags } = req.body;
        const rantId = req.params.id;
        const userId = req.session.user?.id; // Ensure user is logged in

        if (!userId) {
            return res.status(401).json({ error: "Unauthorized. Please log in." });
        }

        if (!title || !content) {
            return res.status(400).json({ error: "Title and content are required." });
        }

        // 🔹 Step 1: Send title & content to Moderation API (with timeout)
        let moderationResult;
        try {
            const response = await axios.post("http://127.0.0.1:5000/moderate", {
                title,
                content,
            }, { timeout: 5000 }); // ⏳ Timeout after 5s

            moderationResult = response.data;
        } catch (error) {
            console.error("🚨 Moderation API Error:", error.message || error);
            req.session.flashMessage = "Moderation service unavailable. Try again later.";
            return res.redirect(`/edit-rant/${rantId}`);
        }

        // 🔹 Step 2: Reject rant if moderation flags it
        if (!moderationResult.allowed) {
            console.log("🛑 Moderation Blocked:", moderationResult.reason);
            req.session.flashMessage = `Your rant violates our community guidelines: ${moderationResult.reason || "Not specified"}`;
            return res.redirect(`/edit-rant/${rantId}`);
        }

        // 🔹 Step 3: Update the rant in the PostgreSQL database
        const updateQuery = `
            UPDATE rants 
            SET title = $1, content = $2, tags = $3, updated_at = NOW() 
            WHERE id = $4 AND user_id = $5
            RETURNING *;
        `;

        const { rows } = await pool.query(updateQuery, [title, content, tags, rantId, userId]);

        if (rows.length === 0) {
            req.session.flashMessage = "Rant not found or you don't have permission to edit this rant.";
            return res.redirect(`/edit-rant/${rantId}`);
        }

        // 🔹 Step 4: Redirect to the user's profile page with a success message
        req.session.flashMessage = "Your rant has been successfully updated!";
        return res.redirect("/profile");

    } catch (error) {
        console.error("🚨 Error updating rant:", error);
        req.session.flashMessage = "Server error. Please try again later.";
        return res.redirect(`/edit-rant/${req.params.id}`);
    }
});

app.post("/delete-rant/:id", async (req, res) => {
    try {
        // 1️⃣ Check if user is logged in
        const userId = req.session.user?.id;
        if (!userId) {
            req.session.flashMessage = "Unauthorized. Please log in.";
            return res.redirect("/login");
        }

        // 2️⃣ Fetch the rant from 'rants' to confirm ownership
        const rantId = req.params.id;
        const { rows } = await pool.query(
            "SELECT * FROM rants WHERE id = $1 AND user_id = $2",
            [rantId, userId]
        );

        if (rows.length === 0) {
            req.session.flashMessage = "Rant not found or you don't have permission to delete it.";
            return res.redirect("/profile"); 
        }

        // 3️⃣ Insert the rant into 'deleted_rants'
        const rant = rows[0];
        const insertQuery = `
        INSERT INTO deleted_rants (user_id, title, content, tags, deleted_at)
        VALUES ($1, $2, $3, $4, NOW());
    `;
    await pool.query(insertQuery, [
        rant.user_id,
        rant.title,
        rant.content,
        rant.tags
    ]);

        // 4️⃣ Delete the rant from 'rants'
        await pool.query("DELETE FROM rants WHERE id = $1", [rantId]);

        // 5️⃣ Redirect user with a success message
        req.session.flashMessage = "Your rant has been deleted.";
        res.redirect("/profile");
    } catch (error) {
        console.error("❌ Error deleting rant:", error);
        req.session.flashMessage = "Server error. Please try again later.";
        res.redirect("/profile");
    }
});


app.post("/delete-reply/:id", async (req, res) => {
    try {
        const replyId = req.params.id;
        const userId = req.session.user?.id; // Ensure user is logged in

        if (!userId) {
            return res.status(401).json({ error: "Unauthorized. Please log in." });
        }

        // 🔹 Step 1: Check if the reply exists and if the user is authorized to delete it
        const checkQuery = "SELECT * FROM replies WHERE id = $1 AND user_id = $2";
        const { rows } = await pool.query(checkQuery, [replyId, userId]);

        if (rows.length === 0) {
            req.session.flashMessage = "Reply not found or you don't have permission to delete this reply.";
            return res.redirect("back"); // Redirect back if not found or unauthorized
        }

        const reply = rows[0];

        // 🔹 Step 2: Insert the reply into the deleted_replies table
        const archiveQuery = `
            INSERT INTO deleted_replies (original_reply_id, rant_id, user_id, parent_reply_id, content)
            VALUES ($1, $2, $3, $4, $5);
        `;
        await pool.query(archiveQuery, [reply.id, reply.rant_id, reply.user_id, reply.parent_reply_id, reply.content]);

        // 🔹 Step 3: Delete the reply from the replies table
        const deleteQuery = "DELETE FROM replies WHERE id = $1";
        await pool.query(deleteQuery, [replyId]);

        // 🔹 Step 4: Redirect user back to the thread page
        req.session.flashMessage = "Your reply has been deleted.";
        return res.redirect(`/thread/${reply.rant_id}`);

    } catch (error) {
        console.error("🚨 Error deleting reply:", error);
        req.session.flashMessage = "Server error. Please try again later.";
        return res.redirect("back");
    }
});


app.post("/edit-reply/:replyId", async (req, res) => {
    try {
        const { replyId } = req.params;
        const { content } = req.body;
        const userId = req.session.user?.id;

        if (!userId) {
            req.session.flashMessage = "Unauthorized. Please log in.";
            return res.redirect("back");
        }

        if (!content.trim()) {
            req.session.flashMessage = "Reply content cannot be empty.";
            return res.redirect("back");
        }

        // 🔹 Step 1: Check if the reply exists and belongs to the user
        const checkQuery = `SELECT user_id, rant_id FROM replies WHERE id = $1`;
        const checkResult = await pool.query(checkQuery, [replyId]);

        if (checkResult.rows.length === 0) {
            req.session.flashMessage = "Reply not found.";
            return res.redirect("back");
        }

        if (checkResult.rows[0].user_id !== userId) {
            req.session.flashMessage = "Unauthorized action.";
            return res.redirect("back");
        }

        const rantId = checkResult.rows[0].rant_id; // Needed for redirection

        // 🔹 Step 2: Send the edited content to the Moderation API
        let moderationResult;
        try {
            const response = await axios.post("http://127.0.0.1:5000/moderate", {
                title: "Reply",
                content: content,
                tags: "reply"
            }, { timeout: 5000 });

            moderationResult = response.data;
        } catch (error) {
            console.error("🚨 Moderation API Error:", error.response?.data || error.message || error);
            req.session.flashMessage = "Moderation service is currently unavailable. Try again later.";
            return res.redirect("back");
        }

        // 🔹 Step 3: Reject the edit if flagged by moderation
        if (!moderationResult.allowed) {
            req.session.flashMessage = `❌ Edit Rejected: ${moderationResult.reason || "Violates community guidelines."}`;
            return res.redirect("back");
        }

        // 🔹 Step 4: Update the reply in the database
        const updateQuery = `
            UPDATE replies
            SET content = $1, updated_at = NOW()
            WHERE id = $2;
        `;
        await pool.query(updateQuery, [content, replyId]);

        console.log("✅ Reply Updated:", replyId);

        req.session.flashMessage = "✅ Reply updated successfully!";
        res.redirect(`/thread/${rantId}#reply-${replyId}`);

    } catch (error) {
        console.error("❌ Error editing reply:", error);
        req.session.flashMessage = "Server error. Please try again later.";
        res.redirect("back");
    }
});


app.get("/rants", async (req, res) => {
    try {
        const { filter } = req.query; // Get filter from query params
        console.log("Filter received:", filter); // Debugging
        
        let query;
        let values = [];

        if (!filter || filter.toLowerCase() === "random") {
            // Fetch 10 random rants
            query = "SELECT * FROM rants ORDER BY RANDOM() LIMIT 10";
        } else {
            // Debugging: Print query before execution
            console.log("Applying filter:", filter);

            // Fetch 10 random rants that match the filter tag
            query = `
                SELECT * FROM rants 
                WHERE tags = $1
                ORDER BY RANDOM() 
                LIMIT 10
            `;
            values = [filter];
        }

        console.log("Executing query:", query, "with values:", values);
        const { rows: rants } = await pool.query(query, values);

        res.render("feed", { user: req.session.user || null, rants, filter });


    } catch (error) {
        console.error("❌ Error fetching rants:", error);
        res.status(500).send("Server error. Please try again later.");
    }
});

// Redirect `/feed` to `/rants` with filter parameter
app.get("/feed", (req, res) => {
    const filter = req.query.tags || "random"; // ✅ Fix: Match the "name" attribute
    console.log("Redirecting to /rants with filter:", filter);
    res.redirect(`/rants?filter=${encodeURIComponent(filter)}`);
});







// ✅ Logout Route
app.post("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/");
    });
});

// Start Server
app.listen(port, () => {
    console.log(`🔥 Server is running on http://localhost:${port}`);
});
