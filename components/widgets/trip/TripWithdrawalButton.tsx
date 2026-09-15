/**
 * Handing a tracker back — the one destructive control on a trip card.
 *
 * It shows as Decline while the work is still an offer and as Abandon once the
 * driver owns it, and on a tracker with no way out it renders nothing rather
 * than a dead button. Every tap is confirmed: this sits next to Accept and
 * Start, a driver taps it with gloves on in a truck, and nothing here can be
 * undone from the phone.
 */

import { typeScale } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import type { WorkTrackerKind } from "@/utils/workTrackerKind";
import {
  type WithdrawalAction,
  withdrawalActionFor,
  withdrawalCopy,
} from "@/utils/tripWithdrawal";
import React, { useCallback } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity } from "react-native";

type Props = {
  status: string | null | undefined;
  kind: WorkTrackerKind;
  onWithdraw: (action: WithdrawalAction) => void;
};

function TripWithdrawalButton({ status, kind, onWithdraw }: Props) {
  const { theme } = useTheme();
  const action = withdrawalActionFor(status);

  const confirm = useCallback(() => {
    if (!action) return;
    const copy = withdrawalCopy(action, kind);

    Alert.alert(copy.title, copy.message, [
      { text: "Cancel", style: "cancel" },
      {
        text: copy.confirm,
        style: "destructive",
        onPress: () => onWithdraw(action),
      },
    ]);
  }, [action, kind, onWithdraw]);

  if (!action) return null;

  const copy = withdrawalCopy(action, kind);

  return (
    <TouchableOpacity
      style={[styles.button, { borderColor: theme.danger }]}
      onPress={confirm}
      accessibilityRole="button"
      accessibilityLabel={copy.title}
    >
      <Text style={[styles.buttonText, { color: theme.danger }]}>
        {copy.button}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    ...typeScale.subhead,
    fontWeight: "600",
  },
});

export default React.memo(TripWithdrawalButton);
