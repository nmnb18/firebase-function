// import fetch from "node-fetch";

// const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// export async function sendExpoPush({
//     token,
//     title,
//     body,
//     data,
//     channelId = "default",
// }: {
//     token: string;
//     title: string;
//     body: string;
//     data?: any;
//     channelId?: string;
// }) {
//     const payload = {
//         to: token,
//         title,
//         body,
//         data,
//         sound: "default",
//         channelId,
//     };

//     const response = await fetch(EXPO_PUSH_URL, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(payload),
//     });

//     return response.json();
// }
