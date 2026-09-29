import { config } from "./config";
import type { EmailRow } from "./db";

const endpoint = config.elastic.replace(/\/$/, "");

function document(email: EmailRow) {
  return {
    tenantId: email.tenant_id,
    recipient: email.recipient,
    subject: email.subject,
    body: email.body,
    sender: email.sender,
    status: email.status,
    scheduledAt: email.scheduled_at,
    sentAt: email.sent_at,
  };
}

export async function indexEmail(email: EmailRow) {
  try {
    const response = await fetch(`${endpoint}/emails/_doc/${email.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(document(email)),
    });
    if (!response.ok) throw new Error(`Elasticsearch HTTP ${response.status}`);
  } catch (error) {
    console.warn("Could not index email in Elasticsearch:", error);
  }
}

export async function indexEmails(emails: EmailRow[]) {
  for (let offset = 0; offset < emails.length; offset += 500) {
    const batch = emails.slice(offset, offset + 500);
    const lines =
      batch
        .flatMap((email) => [
          JSON.stringify({ index: { _index: "emails", _id: email.id } }),
          JSON.stringify(document(email)),
        ])
        .join("\n") + "\n";
    try {
      const response = await fetch(`${endpoint}/_bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/x-ndjson" },
        body: lines,
      });
      if (
        !response.ok ||
        ((await response.json()) as { errors?: boolean }).errors
      )
        throw new Error("Elasticsearch bulk indexing failed");
    } catch (error) {
      console.warn("Could not bulk-index emails in Elasticsearch:", error);
    }
  }
}

export async function searchIds(
  tenantId: string,
  query: string,
): Promise<string[] | null> {
  try {
    const response = await fetch(`${endpoint}/emails/_search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        size: 500,
        _source: false,
        query: {
          bool: {
            filter: [{ term: { "tenantId.keyword": tenantId } }],
            must: [
              {
                multi_match: {
                  query,
                  fields: ["recipient", "subject", "body", "sender"],
                },
              },
            ],
          },
        },
      }),
    });
    if (!response.ok) throw new Error(`Elasticsearch HTTP ${response.status}`);
    const result = (await response.json()) as {
      hits: { hits: Array<{ _id: string }> };
    };
    return result.hits.hits.map((hit) => hit._id);
  } catch (error) {
    console.warn(
      "Elasticsearch search unavailable; using database fallback:",
      error,
    );
    return null;
  }
}
