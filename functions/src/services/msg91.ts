import axios from "axios";

const MSG91_API_BASE = "https://control.msg91.com/api/v5";

function getAuthKey(): string {
  const key = process.env.MSG91_AUTH_KEY;
  if (!key) throw new Error("MSG91_AUTH_KEY environment variable is not configured");
  return key;
}

function getTemplateId(): string {
  const id = process.env.MSG91_TEMPLATE_ID;
  if (!id) throw new Error("MSG91_TEMPLATE_ID environment variable is not configured");
  return id;
}

interface MSG91Response {
  type: "success" | "error";
  message: string;
}

/**
 * Send an OTP to the given Indian mobile number (10 digits, no country code).
 * Requires MSG91_AUTH_KEY and MSG91_TEMPLATE_ID in .env.
 */
export async function sendMSG91OTP(phone: string): Promise<void> {
  const authkey = getAuthKey();
  const template_id = getTemplateId();

  const response = await axios.post<MSG91Response>(
    `${MSG91_API_BASE}/otp`,
    null,
    {
      params: { authkey, mobile: phone, template_id },
      timeout: 10_000,
    }
  );

  if (response.data.type === "error") {
    throw new Error(`MSG91 OTP send failed: ${response.data.message}`);
  }
}

/**
 * Verify an OTP submitted by the user against the MSG91 session.
 * Throws if the OTP is invalid or expired.
 */
export async function verifyMSG91OTP(phone: string, otp: string): Promise<void> {
  const authkey = getAuthKey();

  const response = await axios.get<MSG91Response>(
    `${MSG91_API_BASE}/otp/verify`,
    {
      params: { authkey, mobile: phone, otp },
      timeout: 10_000,
    }
  );

  if (response.data.type === "error") {
    throw new Error("Invalid OTP");
  }
}
