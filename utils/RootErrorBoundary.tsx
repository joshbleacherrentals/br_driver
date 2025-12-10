// RootErrorBoundary.tsx
import React from "react";
import { Text, View } from "react-native";

export class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: any }
> {
  state = { error: null };

  componentDidCatch(error: any, info: any) {
    console.error("Root error boundary:", error, info);
    this.setState({ error });
  }

  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
          <Text>Something went wrong.</Text>
          <Text>{String(this.state.error)}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}
