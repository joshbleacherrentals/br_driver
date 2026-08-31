import { useAppVersionGate } from "@/features/app-version/hooks/useAppVersionGate";
import { useDueSurvey } from "@/hooks/db/useDriverSurvey";
import { useDriverScope } from "@/hooks/useDriverScope";
import { useInitialSyncStatus } from "@/hooks/db/useInitialSyncStatus";
import { useUser } from "@clerk/clerk-expo";
import React, { useCallback, useState } from "react";

import SurveyModal from "./components/SurveyModal";
import { shouldAskSurvey } from "./utils/surveyGateState";
import { submitSurveyResponse } from "./utils/submitSurveyResponse";
import type { SurveyDraftAnswer } from "./utils/surveyValidation";

/**
 * Driver Satisfaction Score — the survey a driver cannot dismiss.
 *
 * Mounted once near the root of the signed-in tree, alongside the store-version
 * gate. It decides nothing itself: `shouldAskSurvey` holds the rules and is
 * tested on its own, `useDueSurvey` supplies the answer from data already on
 * the device, and this component is the wiring between them and the modal.
 *
 * Once the submission is written the modal closes on its own — no local "done"
 * flag involved. `useDueSurvey` is a reactive query over the same local table
 * the write just landed in, so the survey stops being due the instant the row
 * exists, offline included. A flag would be a second source of truth that could
 * disagree with the database.
 */
export default function DriverSurveyGate() {
  const { isSignedIn, isLoaded } = useUser();
  const enabled = isLoaded && !!isSignedIn;

  const scope = useDriverScope();
  const { hasSynced } = useInitialSyncStatus();
  const { due, isLoading } = useDueSurvey();
  // Read a second time rather than threaded down from AppVersionGate: the hook
  // is a reactive read of a one-row table plus a key-value lookup, and the
  // alternative is a shared mutable flag between two gates that must not
  // disagree. A driver whose build is force-blocked cannot act on anything the
  // app shows, so the survey waits.
  const { status } = useAppVersionGate(enabled);

  const [submitting, setSubmitting] = useState(false);

  const visible = shouldAskSurvey({
    isSignedIn: enabled,
    hasSynced,
    scopeReady: scope !== null,
    dataLoading: isLoading,
    blockedByVersionGate: status.kind === "force",
    due: due?.survey ?? null,
  });

  const handleSubmit = useCallback(
    async (drafts: Record<string, SurveyDraftAnswer>) => {
      if (!due || !scope || submitting) return;

      setSubmitting(true);
      try {
        const result = await submitSurveyResponse({
          surveyId: due.survey.id,
          questions: due.questions,
          drafts,
          scope,
          now: Date.now(),
        });

        // The only way this fails is a draft the modal should not have let
        // through. Nothing to show the driver — the Submit button re-enables
        // and the failing field is already the one the modal is highlighting.
        if (!result.ok) {
          console.warn(
            "[DriverSurvey] Submission rejected locally:",
            result.reason,
          );
        }
      } catch (error) {
        console.error("[DriverSurvey] Failed to record submission:", error);
      } finally {
        setSubmitting(false);
      }
    },
    [due, scope, submitting],
  );

  if (!visible || !due) return null;

  return (
    <SurveyModal
      visible
      title={due.survey.title}
      questions={due.questions}
      submitting={submitting}
      onSubmit={handleSubmit}
    />
  );
}
