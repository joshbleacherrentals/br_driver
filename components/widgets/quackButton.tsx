import { useTheme } from "@/hooks/useTheme";
import * as Haptics from "expo-haptics";
import { useAudioPlayer } from "expo-audio";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { G, Path, Rect } from "react-native-svg";

const QUACK = require("../../assets/sounds/quack.m4a");

/**
 * The duck.
 *
 * The artwork is a knockout: its path fills the whole 1080×1080 square *except*
 * the duck (and the eye is a second knockout inside it). So it is drawn over a
 * duck-coloured plate — the path paints the plate back out in the sheet's own
 * surface colour, and what survives is the bird. That keeps the supplied SVG
 * byte-for-byte as drawn, and it re-colours correctly in both themes for free,
 * since `theme.surface` is exactly what the sheet is filled with.
 */
export function QuackButton() {
  const { theme } = useTheme();
  const player = useAudioPlayer(QUACK);

  const quack = React.useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      // Rewind first: tapping again while the clip is still running should
      // re-quack, not be swallowed by a player that is already at the end.
      player.seekTo(0);
      player.play();
    } catch {
      // An easter egg is never worth an error. A silent duck is still a duck.
    }
  }, [player]);

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={quack}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Duck"
        style={({ pressed }) => [styles.press, pressed && styles.pressed]}
      >
        <Svg width={44} height={44} viewBox="0 0 1080 1080">
          <Rect width={1080} height={1080} fill={theme.warning} />
          <G
            transform="translate(0.000000,1080.000000) scale(0.100000,-0.100000)"
            fill={theme.surface}
          >
            <Path d="M0 5400 l0 -5400 5400 0 5400 0 0 5400 0 5400 -5400 0 -5400 0 0
-5400z m5670 512 c244 -68 387 -140 574 -291 92 -75 261 -270 315 -365 195
-341 246 -764 135 -1118 -30 -97 -115 -278 -167 -359 -136 -212 -336 -388
-559 -494 -207 -98 -374 -135 -608 -135 -230 0 -434 46 -625 140 -98 48 -256
168 -389 293 l-99 93 89 43 c100 48 167 98 190 144 41 78 5 250 -91 435 -69
133 -142 234 -267 369 -119 127 -158 184 -158 230 0 59 87 255 181 410 189
309 527 540 904 617 110 23 476 15 575 -12z m-1717 -1261 c64 -43 186 -177
246 -266 105 -159 166 -311 166 -414 0 -56 -3 -66 -25 -82 -44 -33 -130 -41
-380 -36 -206 3 -244 7 -310 26 -306 91 -750 431 -750 576 0 55 69 137 131
155 19 6 140 15 269 20 229 10 278 15 445 45 104 18 156 12 208 -24z m4248
-661 c158 -53 193 -106 249 -380 30 -147 72 -279 147 -465 78 -190 136 -350
158 -434 59 -227 92 -591 76 -837 -8 -129 -15 -166 -45 -261 -81 -248 -162
-397 -293 -534 -200 -210 -464 -360 -868 -495 -780 -260 -1563 -368 -2210
-304 -454 45 -711 120 -1135 332 -415 207 -668 423 -798 683 -76 152 -135 378
-135 515 1 224 105 517 279 787 124 192 427 406 724 511 166 58 257 52 510
-33 184 -63 277 -77 505 -79 318 -2 422 26 795 214 l175 88 265 21 c823 67
816 65 1072 411 86 116 153 190 216 238 72 55 189 63 313 22z" />
            <Path d="M4562 5219 c-124 -63 -214 -300 -171 -452 13 -47 102 -143 142 -153
76 -18 184 61 242 179 83 168 63 341 -46 414 -54 35 -113 40 -167 12z" />
          </G>
        </Svg>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", paddingTop: 20 },
  press: { padding: 4 },
  pressed: { opacity: 0.6, transform: [{ scale: 0.92 }] },
});
