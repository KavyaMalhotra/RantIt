import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config(); // Load environment variables

// ✅ Set up email transporter
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false, 
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// ✅ Function to send verification email
export const sendVerificationEmail = async (email, token) => {
    const verificationLink = `http://localhost:3000/verify/${token}`;
    
    const mailOptions = {
        from: `"RantIt" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Verify Your Email - RantIt",
        html: `<h2>Welcome to RantIt!</h2>
               <p>Click the link below to verify your email:</p>
               <a href="${verificationLink}" style="display:inline-block; padding:10px 15px; background:#0aff99; color:white; text-decoration:none; font-weight:bold;">Verify Email</a>
               <p>If you did not sign up, ignore this email.</p>`,
    };

    await transporter.sendMail(mailOptions);
};
