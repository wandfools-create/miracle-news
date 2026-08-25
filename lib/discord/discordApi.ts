import "server-only";

export type DiscordFetch = typeof fetch;

const DISCORD_API = "https://discord.com/api/v10";

export type DiscordChannelMessageResponse = {
  id: string;
};

export async function sendDiscordChannelMessage(input: {
  channelId: string;
  botToken: string;
  body: Record<string, unknown>;
  fetchImpl?: DiscordFetch;
}): Promise<
  | { ok: true; messageId: string }
  | { ok: false; error: string; status?: number }
> {
  const fetchFn = input.fetchImpl ?? fetch;
  const res = await fetchFn(
    `${DISCORD_API}/channels/${input.channelId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bot ${input.botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input.body),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      error: text.slice(0, 200) || `discord_http_${res.status}`,
      status: res.status,
    };
  }

  const data = (await res.json()) as DiscordChannelMessageResponse;
  if (!data?.id) {
    return { ok: false, error: "missing_message_id" };
  }
  return { ok: true, messageId: data.id };
}

/** Edit original message after type-5 deferred update (interaction token auth). */
export async function editOriginalInteractionMessage(input: {
  applicationId: string;
  interactionToken: string;
  body: Record<string, unknown>;
  fetchImpl?: DiscordFetch;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const fetchFn = input.fetchImpl ?? fetch;
  const res = await fetchFn(
    `${DISCORD_API}/webhooks/${input.applicationId}/${input.interactionToken}/messages/@original`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input.body),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      error: text.slice(0, 200) || `discord_http_${res.status}`,
    };
  }
  return { ok: true };
}
