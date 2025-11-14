# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## Clerk OAuth setup (Expo)

If you see a "Redirect url mismatch" error from Clerk during Google sign-in, make sure these Redirect URLs are added to your Clerk dashboard (Allowlist > Authorized Redirect URLs):

- Native/development build and production:
  - `brdriver://oauth-native-callback`
- Expo Go (managed development with the AuthSession Proxy):
  - `https://auth.expo.io/@your-username/br_driver/oauth-native-callback`

Notes:

- Replace `@your-username` with your Expo account username. Log the URL printed as "Clerk SSO redirect URL" in Metro when you press the sign-in button.
- The app scheme `brdriver` is defined in `app.json` and is used for native redirects in development builds and production apps.

If you see an error about the AuthSession proxy missing the project full name, make sure your project has an Expo owner set so the proxy URL can be resolved. If you get a generic "Something went wrong trying to finish signing in" page, confirm the path segment `/oauth-native-callback` is included in the proxy URL you added to Clerk.

- Add `"owner": "your-expo-username"` under the `expo` key in `app.json`, or
- Sign into your Expo account locally so `Constants.expoConfig.owner` is populated, or
- Prefer a Development Build (so the custom scheme works and the proxy isn’t needed).
