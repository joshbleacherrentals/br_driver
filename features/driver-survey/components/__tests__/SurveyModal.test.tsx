/**
 * The modal a driver cannot dismiss.
 *
 * "Undismissable" is the whole product requirement, and it is carried entirely
 * by things that are easy to undo by accident: an `onRequestClose` that must
 * stay inert (it is the Android hardware back button), a backdrop that must
 * stay a plain `View` rather than becoming a `TouchableOpacity`, and the
 * absence of any close control. A future tidy-up that "fixes" the empty
 * handler, or wraps the backdrop to add a press-outside affordance, would
 * silently turn a mandatory survey into an optional one — with nothing failing.
 *
 * The other half is Submit: it must stay disabled until the answer is one the
 * Postgres trigger will also accept, because a write the server refuses is
 * dropped from the PowerSync outbox in silence.
 */

import React from "react";
import { Modal, TextInput, TouchableOpacity, View } from "react-native";

import SurveyModal from "@/features/driver-survey/components/SurveyModal";
import type { SurveyQuestion } from "@/features/driver-survey/utils/surveyValidation";

jest.mock("@/hooks/useTheme", () => ({
  __esModule: true,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useTheme: () => ({ theme: require("@/constants/theme").themes.light }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require("react-test-renderer") as {
  create: (element: React.ReactElement) => any;
  act: (callback: () => void) => void;
};

const question: SurveyQuestion = {
  id: "q1",
  prompt: "How satisfied are you overall with the mobile app?",
  kind: "scale_1_10",
  follow_up_max_score: 6,
  follow_up_prompt: "What would make it better?",
  is_required: 1,
};

function render(overrides: Partial<React.ComponentProps<typeof SurveyModal>> = {}) {
  let tree: any;
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <SurveyModal
        visible
        title="Mobile App Satisfaction"
        questions={[question]}
        submitting={false}
        onSubmit={jest.fn()}
        {...overrides}
      />,
    );
  });
  return tree;
}

/** The Submit button is the last TouchableOpacity in the tree. */
function submitButton(tree: any) {
  const buttons = tree.root.findAllByType(TouchableOpacity);
  return buttons[buttons.length - 1];
}

function scoreButton(tree: any, score: number) {
  return tree.root
    .findAllByType(TouchableOpacity)
    .find((node: any) => node.props.accessibilityLabel === `${score} out of 10`);
}

describe("SurveyModal — there is no way out", () => {
  it("makes the Android hardware back button do nothing", () => {
    const tree = render();
    const modal = tree.root.findByType(Modal);

    // Present and inert: the prop must exist (React Native warns without it)
    // and must not close anything.
    expect(typeof modal.props.onRequestClose).toBe("function");
    expect(() => modal.props.onRequestClose()).not.toThrow();
    expect(tree.root.findByType(Modal).props.visible).toBe(true);
  });

  it("has no dismissable backdrop — tapping outside cannot close it", () => {
    const tree = render();
    const modal = tree.root.findByType(Modal);

    // The backdrop is the first View inside the Modal. If it ever becomes a
    // TouchableOpacity/Pressable, this fails — which is the point.
    const backdrop = modal.findByType(View);
    expect(backdrop.type).toBe(View);
    expect(backdrop.props.onPress).toBeUndefined();
    expect(backdrop.props.onStartShouldSetResponder).toBeUndefined();
  });

  it("offers no close or skip control — only Submit", () => {
    const tree = render();
    const labels = tree.root
      .findAllByType(TouchableOpacity)
      .map((node: any) => node.props.accessibilityLabel ?? "")
      .join(" ")
      .toLowerCase();

    expect(labels).not.toMatch(/close|dismiss|skip|later|cancel|not now/);
  });

  it("is not a swipe-to-dismiss sheet", () => {
    const modal = render().root.findByType(Modal);
    // A transparent RN Modal has no swipe affordance; guard the props that
    // would introduce one.
    expect(modal.props.transparent).toBe(true);
    expect(modal.props.presentationStyle).toBeUndefined();
  });
});

describe("SurveyModal — Submit gating", () => {
  it("starts disabled, before any score is chosen", () => {
    expect(submitButton(render()).props.disabled).toBe(true);
  });

  it("enables once a high score is chosen, with no reason needed", () => {
    const tree = render();
    TestRenderer.act(() => scoreButton(tree, 9).props.onPress());
    expect(submitButton(tree).props.disabled).toBe(false);
  });

  it("shows no reason field until a low score is chosen", () => {
    const tree = render();
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);

    TestRenderer.act(() => scoreButton(tree, 3).props.onPress());
    expect(tree.root.findAllByType(TextInput)).toHaveLength(1);
  });

  it("stays disabled at a low score while the reason is empty", () => {
    const tree = render();
    TestRenderer.act(() => scoreButton(tree, 3).props.onPress());
    expect(submitButton(tree).props.disabled).toBe(true);
  });

  it("stays disabled while the reason is only whitespace", () => {
    const tree = render();
    TestRenderer.act(() => scoreButton(tree, 3).props.onPress());
    TestRenderer.act(() =>
      tree.root.findByType(TextInput).props.onChangeText("    "),
    );
    expect(submitButton(tree).props.disabled).toBe(true);
  });

  it("enables at a low score once a real reason is written", () => {
    const tree = render();
    TestRenderer.act(() => scoreButton(tree, 3).props.onPress());
    TestRenderer.act(() =>
      tree.root.findByType(TextInput).props.onChangeText("the app is slow"),
    );
    expect(submitButton(tree).props.disabled).toBe(false);
  });

  it("re-disables if the driver clears the reason after writing one", () => {
    const tree = render();
    TestRenderer.act(() => scoreButton(tree, 2).props.onPress());
    TestRenderer.act(() =>
      tree.root.findByType(TextInput).props.onChangeText("slow"),
    );
    expect(submitButton(tree).props.disabled).toBe(false);

    TestRenderer.act(() => tree.root.findByType(TextInput).props.onChangeText(""));
    expect(submitButton(tree).props.disabled).toBe(true);
  });

  it("hides the reason field again when the score is raised above the threshold", () => {
    const tree = render();
    TestRenderer.act(() => scoreButton(tree, 3).props.onPress());
    expect(tree.root.findAllByType(TextInput)).toHaveLength(1);

    TestRenderer.act(() => scoreButton(tree, 8).props.onPress());
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    expect(submitButton(tree).props.disabled).toBe(false);
  });

  it("follows the question's own threshold rather than a hardcoded 6", () => {
    const tree = render({
      questions: [{ ...question, follow_up_max_score: 3 }],
    });
    // 5 would demand a reason under a threshold of 6; under 3 it must not.
    TestRenderer.act(() => scoreButton(tree, 5).props.onPress());
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    expect(submitButton(tree).props.disabled).toBe(false);
  });

  it("hands the drafts to onSubmit when Submit is pressed", () => {
    const onSubmit = jest.fn();
    const tree = render({ onSubmit });
    TestRenderer.act(() => scoreButton(tree, 7).props.onPress());
    TestRenderer.act(() => submitButton(tree).props.onPress());

    expect(onSubmit).toHaveBeenCalledWith({ q1: { score: 7, reason: "" } });
  });

  it("blocks a second press while the first submission is in flight", () => {
    const tree = render({ submitting: true });
    TestRenderer.act(() => scoreButton(tree, 7).props.onPress());
    expect(submitButton(tree).props.disabled).toBe(true);
  });
});
