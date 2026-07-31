import OAuthButton from "@/components/OAuthButton";
import { typeScale } from "@/constants/theme";
import { AppleSignInButton } from "@/components/SignInWithApple";
import { getAuthStyles } from "@/constants/AuthStyles";
import { useAuthError } from "@/hooks/useAuthError";
import { useTheme } from "@/hooks/useTheme";
import { useSignIn } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

function SignInScreen() {
  const { theme, scheme } = useTheme();
  const styles = getAuthStyles(scheme);
  const router = useRouter();
  // [useSignIn hook](/docs/hooks/use-sign-in) from Clerk SDK to handle sign-in logic
  const { signIn, isLoaded, setActive } = useSignIn();
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const { errorVisible, errorMessages, showError, hideError } = useAuthError();

  const onSignInPress = async () => {
    if (!isLoaded || !setActive) return;

    try {
      // signIn.create() method from Clerk SDK to handle sign-in logic
      const signInAttempt = await signIn.create({
        identifier: emailAddress,
        password,
      });

      if (signInAttempt.status === "complete") {
        await setActive({
          session: signInAttempt.createdSessionId,
        });
        // Navigate to protected screen once the session is created
        router.replace("/(tabs)/index");
      } else {
        console.error("Sign-in not complete", signInAttempt);
        showError(new Error("Unable to sign in. Please check your credentials and try again."));
      }
    } catch (err: any) {
      // Avoid JSON.stringify on complex objects; log raw and show a friendly modal
      console.error("Sign-in error", err);
      showError(err);
    }
  };

  return (
    <>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: 72,
            paddingBottom: 32,
            flexGrow: 1,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerContainer}>
            <Image
              source={require("@/assets/images/NEW-Bleacher-Rentals-logo.png")}
              style={{ width: 200, height: 60, marginBottom: 16, marginTop: 28 }}
              contentFit="contain"
              accessibilityLabel="Bleacher Rentals"
            />
            <Text style={styles.title}>Welcome to Bleacher Rentals Driver</Text>
            <Text style={styles.subtitle}>
              Please sign in using the email address that your Account Manager used to create your
              account.
            </Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email address</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your email address"
                placeholderTextColor={theme.textTertiary}
                value={emailAddress}
                onChangeText={(text) => setEmailAddress(text)}
                autoCapitalize="none"
                keyboardType="email-address"
                returnKeyType="next"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your password"
                placeholderTextColor={theme.textTertiary}
                value={password}
                onChangeText={(text) => setPassword(text)}
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={() => {
                  Keyboard.dismiss();
                }}
              />
            </View>

            <TouchableOpacity
              style={styles.button}
              onPress={() => {
                Keyboard.dismiss();
                void onSignInPress();
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonText}>Sign In</Text>
            </TouchableOpacity>
          </View>
          {/* can you do something like a line with the word "or" in the center to separate the sign-in methods? */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginVertical: 16,
              marginBottom: -12,
            }}
          >
            <View
              style={{ flex: 1, height: 1, backgroundColor: theme.separator }}
            />
            <Text style={{ marginHorizontal: 8, color: theme.textSecondary }}>
              or
            </Text>
            <View
              style={{ flex: 1, height: 1, backgroundColor: theme.separator }}
            />
          </View>
          {/* OAuthButton component to handle OAuth sign-in */}
          <View style={{ marginBottom: 24 }}>
            <OAuthButton strategy="oauth_google" onError={showError}>
              Sign in with Google
            </OAuthButton>
            <View style={{ height: 12 }} />
            <AppleSignInButton
              onSignInComplete={() => router.replace("/(tabs)/index")}
              onError={showError}
              showDivider={false}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      {/* Error Modal */}
      <Modal visible={errorVisible} transparent animationType="fade" onRequestClose={hideError}>
        <View style={{ flex: 1 }}>
          <BlurView
            intensity={20}
            tint={scheme === "dark" ? "dark" : "light"}
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          />
          <Pressable
            onPress={hideError}
            style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
          >
            <View
              style={{
                width: "86%",
                maxWidth: 420,
                borderRadius: 16,
                padding: 20,
                backgroundColor: theme.surface,
                borderWidth: 1,
                borderColor: theme.border,
                shadowColor: theme.accent,
                shadowOpacity: 0.25,
                shadowOffset: { width: 0, height: 10 },
                shadowRadius: 20,
                elevation: 10,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                <Ionicons name="alert-circle" size={24} color={theme.accent} />
                <Text
                  style={{
                    marginLeft: 8,
                    ...typeScale.title3,
                    fontWeight: "700",
                    color: theme.textPrimary,
                  }}
                >
                  Sign in error
                </Text>
              </View>

              {errorMessages.map((m, idx) => (
                <Text
                  key={idx}
                  style={{
                    marginTop: idx === 0 ? 8 : 6,
                    ...typeScale.subhead,
                    lineHeight: 21,
                    color: theme.textSecondary,
                  }}
                >
                  • {m}
                </Text>
              ))}

              <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 16 }}>
                <TouchableOpacity
                  onPress={hideError}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    backgroundColor: theme.accent,
                    borderRadius: 10,
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={{ color: theme.onAccent, fontWeight: "600" }}>OK</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

export default SignInScreen;
