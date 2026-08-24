import { NextRequest, NextResponse } from "next/server";

import { getDiscordEnv, getDiscordPublicKey } from "@/lib/discord/env";
import { handleDiscordInteractionForRoute } from "@/lib/discord/handleInteraction";
import { verifyDiscordInteractionHeadersAsync } from "@/lib/discord/verifySignature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pong(): NextResponse {
  return NextResponse.json({ type: 1 });
}

export async function POST(request: NextRequest) {
  const publicKey = getDiscordPublicKey();
  if (!publicKey) {
    console.warn("[discord/interactions] DISCORD_PUBLIC_KEY missing or invalid");
    return new NextResponse("discord public key not configured", { status: 503 });
  }

  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  const body = Buffer.from(await request.arrayBuffer()).toString("utf8");

  const valid = await verifyDiscordInteractionHeadersAsync({
    publicKeyHex: publicKey,
    signature,
    timestamp,
    body,
  });

  if (!valid) {
    return new NextResponse("invalid request signature", { status: 401 });
  }

  let interaction: { type?: number };
  try {
    interaction = JSON.parse(body) as { type?: number };
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  // Discord endpoint verification: signed PING must return PONG only.
  if (interaction.type === 1) {
    return pong();
  }

  const env = getDiscordEnv();
  if (!env) {
    console.warn("[discord/interactions] discord env incomplete for button handling");
    return NextResponse.json({
      type: 4,
      data: { content: "Discord 데스크가 아직 설정되지 않았습니다.", flags: 64 },
    });
  }

  const result = await handleDiscordInteractionForRoute(
    interaction as Parameters<typeof handleDiscordInteractionForRoute>[0]
  );

  switch (result.kind) {
    case "pong":
      return pong();
    case "unauthorized":
      return new NextResponse("Unauthorized", { status: 401 });
    case "forbidden":
    case "ephemeral":
    case "bad_request":
      return NextResponse.json({
        type: 4,
        data: { content: result.message, flags: 64 },
      });
    case "update_message":
      return NextResponse.json({
        type: 7,
        data: result.data,
      });
    default:
      return pong();
  }
}
