import { createCallableFunction } from "../../utils/callable";

type AuthResponse = {
  refresh_token: string;
  expires_in: string;
  user_id: string;
  id_token: string;
  error?: { message: string };
};

export const refreshToken = createCallableFunction<
  { refreshToken: string },
  { idToken: string; refreshToken: string; expiresIn: string; userId: string }
>(
  async (data) => {
    const { refreshToken: token } = data;

    if (!token) {
      throw new Error("Missing refreshToken");
    }

    const FIREBASE_API_KEY = process.env.API_KEY;
    if (!FIREBASE_API_KEY) {
      throw new Error("Missing Firebase API Key");
    }

    const url = `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`;
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: token,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const authResponse = (await response.json()) as AuthResponse;

    if (authResponse.error) {
      throw new Error(authResponse.error.message);
    }

    return {
      idToken: authResponse.id_token,
      refreshToken: authResponse.refresh_token,
      expiresIn: authResponse.expires_in,
      userId: authResponse.user_id,
    };
  },
  { region: "asia-south1", requireAuth: false, secrets: ["API_KEY"] }
);
