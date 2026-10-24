const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || '127.0.0.1',
  port: parseInt(process.env.SMTP_PORT || '1025', 10),
  secure: false, // Mailpit uses plaintext SMTP on port 1025
  tls: {
    rejectUnauthorized: false
  }
});

/**
 * Send password reset email
 * @param {string} toEmail 
 * @param {string} rawToken 
 */
async function sendPasswordResetEmail(toEmail, rawToken) {
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost'}/reset-password.html?token=${encodeURIComponent(rawToken)}`;
  
  const mailOptions = {
    from: '"QuizSystem Security" <no-reply@quizsystem.local>',
    to: toEmail,
    subject: 'Yêu cầu đặt lại mật khẩu - QuizSystem',
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px;">
        <h2 style="color: #2563eb; margin-top: 0;">QuizSystem — Đặt lại mật khẩu</h2>
        <p>Xin chào,</p>
        <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản liên kết với địa chỉ email này.</p>
        <p>Vui lòng bấm vào nút bên dưới để tiến hành thiết lập mật khẩu mới (liên kết có hiệu lực trong vòng <strong>15 phút</strong> và chỉ sử dụng được <strong>một lần duy nhất</strong>):</p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${resetUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Đặt Lại Mật Khẩu</a>
        </div>
        <p style="font-size: 13px; color: #666;">Hoặc bạn có thể dán đường dẫn sau vào trình duyệt:<br><a href="${resetUrl}" style="color: #2563eb;">${resetUrl}</a></p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
        <p style="font-size: 12px; color: #999;">Nếu bạn không yêu cầu hành động này, vui lòng bỏ qua email. Mật khẩu của bạn sẽ không bị thay đổi.</p>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[MailService] Password reset email sent to ${toEmail}. MessageId: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`[MailService] Failed to send email to ${toEmail}:`, error.message);
    // Don't crash request, return false
    return false;
  }
}

module.exports = {
  sendPasswordResetEmail
};
