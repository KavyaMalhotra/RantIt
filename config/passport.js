import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import pool from "./db.js";
import dotenv from "dotenv";

dotenv.config();

// ✅ Google OAuth Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
},
async (accessToken, refreshToken, profile, done) => {
    try {
        const email = profile.emails[0].value;
        console.log("🔹 Google OAuth Email Received:", email);

        // ✅ Check if user exists in database
        const userResult = await pool.query("SELECT * FROM users WHERE email = $1", [email]);

        if (userResult.rows.length > 0) {
            return done(null, userResult.rows[0]); // ✅ Existing user → Login
        } else {
            return done(null, { email }); // ✅ Pass email for new user registration
        }
    } catch (err) {
        console.error("❌ Google OAuth Error:", err);
        return done(err, null);
    }
}));

// ✅ Serialize the user into the session (Store ID instead of email)
passport.serializeUser((user, done) => {
    done(null, user.email); // ✅ Store email instead of full user object
});

// ✅ Deserialize user from session and fetch from database
passport.deserializeUser(async (email, done) => {
    try {
        const userResult = await pool.query("SELECT * FROM users WHERE email = $1", [email]);

        if (userResult.rows.length > 0) {
            done(null, userResult.rows[0]); // ✅ Return full user object
        } else {
            done(null, false); // ❌ User not found in DB
        }
    } catch (err) {
        done(err, null);
    }
});

export default passport;
