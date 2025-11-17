import OAuthButton from "@/components/OAuthButton";
import { AppleSignInButton } from "@/components/SignInWithApple";
import { getAuthStyles, PRIMARY, PRIMARY_LIGHT } from "@/constants/AuthStyles";
import { useColorScheme } from "@/hooks/useColorScheme";
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
  const colorScheme = useColorScheme();
  const styles = getAuthStyles(colorScheme);
  const placeholderTextColor = colorScheme === "dark" ? "#94A3B8" : "#94A3B8";
  const router = useRouter();
  // [useSignIn hook](/docs/hooks/use-sign-in) from Clerk SDK to handle sign-in logic
  const { signIn, isLoaded, setActive } = useSignIn();
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [errorVisible, setErrorVisible] = useState(false);
  const [errorMessages, setErrorMessages] = useState<string[]>([]);

  const extractClerkMessages = (err: unknown): string[] => {
    try {
      if (err && typeof err === "object") {
        const anyErr = err as any;
        if (Array.isArray(anyErr?.errors)) {
          const msgs = anyErr.errors.map((e: any) => e?.longMessage || e?.message).filter(Boolean);
          if (msgs.length) return msgs as string[];
        }
        if (typeof anyErr?.message === "string") {
          return [anyErr.message];
        }
      }
      if (err instanceof Error && err.message) return [err.message];
    } catch {}
    return ["Something went wrong. Please try again."];
  };

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
        setErrorMessages(["Unable to sign in. Please check your credentials and try again."]);
        setErrorVisible(true);
      }
    } catch (err: any) {
      // Avoid JSON.stringify on complex objects; log raw and show a friendly modal
      console.error("Sign-in error", err);
      setErrorMessages(extractClerkMessages(err));
      setErrorVisible(true);
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
                placeholderTextColor={placeholderTextColor}
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
                placeholderTextColor={placeholderTextColor}
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
            <View style={{ flex: 1, height: 1, backgroundColor: "#ccc" }} />
            <Text style={{ marginHorizontal: 8, color: "#666" }}>or</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: "#ccc" }} />
          </View>
          {/* OAuthButton component to handle OAuth sign-in */}
          <View style={{ marginBottom: 24 }}>
            <OAuthButton strategy="oauth_google">Sign in with Google</OAuthButton>
            <AppleSignInButton
              onSignInComplete={() => router.replace("/(tabs)/index")}
              showDivider={false}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      /* Error Modal */
      <Modal
        visible={errorVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setErrorVisible(false)}
      >
        <View style={{ flex: 1 }}>
          <BlurView
            intensity={20}
            tint={colorScheme === "dark" ? "dark" : "light"}
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          />
          <Pressable
            onPress={() => setErrorVisible(false)}
            style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
          >
            <View
              style={{
                width: "86%",
                maxWidth: 420,
                borderRadius: 16,
                padding: 20,
                backgroundColor: colorScheme === "dark" ? "#0b1f35" : "#ffffff",
                borderWidth: 1,
                borderColor: colorScheme === "dark" ? "#1d3d5b" : "#E2E8F0",
                shadowColor: PRIMARY_LIGHT,
                shadowOpacity: 0.25,
                shadowOffset: { width: 0, height: 10 },
                shadowRadius: 20,
                elevation: 10,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                <Ionicons name="alert-circle" size={24} color={PRIMARY_LIGHT} />
                <Text
                  style={{
                    marginLeft: 8,
                    fontSize: 18,
                    fontWeight: "700",
                    color: colorScheme === "dark" ? "#F1F5F9" : "#0F172A",
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
                    fontSize: 15,
                    lineHeight: 21,
                    color: colorScheme === "dark" ? "#CBD5E1" : "#334155",
                  }}
                >
                  • {m}
                </Text>
              ))}

              <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 16 }}>
                <TouchableOpacity
                  onPress={() => setErrorVisible(false)}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    backgroundColor: PRIMARY,
                    borderRadius: 10,
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={{ color: "#fff", fontWeight: "600" }}>OK</Text>
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
