const nodemailer = require('nodemailer');
require('dotenv').config();

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Configure the Nodemailer transporter for Gmail
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

const sendWelcome = async (email, name, verificationToken) => {
  const verifyLink = `${FRONTEND_URL}/verify-email/${verificationToken}`;
  const htmlContent = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0b0b0b; color: #f5f5f5; border: 1px solid #222; border-radius: 8px;">
      <h1 style="color: #ff5f5f; border-bottom: 1px solid #222; padding-bottom: 10px;">Welcome to RepoForge</h1>
      <p>Hi ${name},</p>
      <p>Thank you for registering on RepoForge, the ultimate full-stack codebase intelligence tool.</p>
      <p>Please click the button below to verify your email address and activate your account:</p>
      <div style="margin: 30px 0; text-align: center;">
        <a href="${verifyLink}" style="background-color: #ff5f5f; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; display: inline-block;">Verify Email</a>
      </div>
      <p>If the button doesn't work, copy and paste this link into your browser:</p>
      <p style="background-color: #1a1a1a; padding: 10px; border-radius: 4px; word-break: break-all;"><a href="${verifyLink}" style="color: #ff5f5f; text-decoration: none;">${verifyLink}</a></p>
      <p style="margin-top: 40px; color: #777; font-size: 0.85em;">If you did not request this, you can safely ignore this email.</p>
    </div>
  `;

  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    console.log('\n==================================================');
    console.log(`[EMAIL FALLBACK] Welcome Email to ${name} (${email})`);
    console.log(`[VERIFICATION LINK] ${verifyLink}`);
    console.log('==================================================\n');
    return { success: true, fallback: true };
  }

  try {
    const info = await transporter.sendMail({
      from: `"RepoForge" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Welcome to RepoForge — Verify your email',
      html: htmlContent
    });
    return { success: true, data: info };
  } catch (error) {
    console.error('Failed to send welcome email via Nodemailer:', error);
    return { success: false, error };
  }
};

const sendAnalysisComplete = async (email, name, repoName, analysisId) => {
  const analysisLink = `${FRONTEND_URL}/analysis/${analysisId}`;
  const htmlContent = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0b0b0b; color: #f5f5f5; border: 1px solid #222; border-radius: 8px;">
      <h1 style="color: #ff5f5f; border-bottom: 1px solid #222; padding-bottom: 10px;">Analysis Complete!</h1>
      <p>Hi ${name},</p>
      <p>Good news! Your analysis of <strong>${repoName}</strong> is ready to view.</p>
      <p>Click below to open the interactive dependency graph and explore the codebase:</p>
      <div style="margin: 30px 0; text-align: center;">
        <a href="${analysisLink}" style="background-color: #ff5f5f; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; display: inline-block;">View Analysis</a>
      </div>
      <p>Copy and paste link:</p>
      <p style="background-color: #1a1a1a; padding: 10px; border-radius: 4px; word-break: break-all;"><a href="${analysisLink}" style="color: #ff5f5f; text-decoration: none;">${analysisLink}</a></p>
    </div>
  `;

  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    console.log('\n==================================================');
    console.log(`[EMAIL FALLBACK] Analysis Complete to ${name} (${email})`);
    console.log(`[ANALYSIS LINK] ${analysisLink}`);
    console.log('==================================================\n');
    return { success: true, fallback: true };
  }

  try {
    const info = await transporter.sendMail({
      from: `"RepoForge" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Your analysis of ${repoName} is ready`,
      html: htmlContent
    });
    return { success: true, data: info };
  } catch (error) {
    console.error('Failed to send analysis complete email:', error);
    return { success: false, error };
  }
};

module.exports = {
  sendWelcome,
  sendAnalysisComplete
};
