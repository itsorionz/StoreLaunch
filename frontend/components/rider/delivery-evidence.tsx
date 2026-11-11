import type { DeliveryAttemptView, DeliveryProofView } from "@backend/lib/rider-delivery";
import { attemptReasons } from "@backend/lib/rider-delivery";

export function DeliveryEvidence({
  proof,
  attempts,
}: {
  proof: DeliveryProofView | null;
  attempts: DeliveryAttemptView[];
}) {
  return (
    <>
      {proof && (
        <section className="card space-y-2 p-5">
          <h2 className="font-bold">Proof of delivery</h2>
          <p className="text-sm">
            Received by <strong>{proof.receivedBy}</strong> · {proof.relationship.toLowerCase()}
          </p>
          <time className="block text-xs text-muted">
            {proof.createdAt.toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })} BD
          </time>
          {proof.note && <p className="whitespace-pre-wrap text-sm">{proof.note}</p>}
          {proof.photoKey && (
            <a
              href={`/api/rider/proofs/${proof.id}/photo`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm font-semibold text-primary"
            >
              View handover photo
            </a>
          )}
        </section>
      )}
      {!!attempts.length && (
        <section className="card p-5">
          <h2 className="font-bold">Delivery attempts</h2>
          <ol className="mt-3 space-y-4">
            {attempts.map((attempt) => (
              <li key={attempt.id} className="border-l-2 border-border pl-3 text-sm">
                <p className="font-semibold">
                  {attemptReasons[attempt.reason as keyof typeof attemptReasons] ?? attempt.reason}
                </p>
                <p className="mt-1 whitespace-pre-wrap">{attempt.note}</p>
                <time className="text-xs text-muted">
                  {attempt.createdAt.toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })} BD
                </time>
                {attempt.nextAttemptAt && (
                  <p className="mt-1 text-xs text-primary">
                    Retry:{" "}
                    {attempt.nextAttemptAt.toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })} BD
                  </p>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
