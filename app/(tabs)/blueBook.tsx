import ProfileCompletionBanner from '@/components/widgets/onboardingBanner';
import { Image } from "expo-image";
import React from "react";
import { SafeAreaView, Text, View } from "react-native";

const DARK_BLUE = "#10365A";
const LIGHT_BLUE = "#1D62A3";

export default function BlueBookScreen() {
    const logo = require('../../assets/images/adaptive-icon.png');
    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: DARK_BLUE }}>
            <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Image 
                source={logo} 
                style={{ width: 45, height: 45 }}
            />
            <Text style={{ fontSize: 24, fontWeight: "700", letterSpacing: 0.3, color: '#111827', position: 'absolute', left: 0, right: 0, textAlign: 'center' }}>Driver's Blue Book</Text>
            <View style={{ width: 45, height: 45 }} />
            </View>

            <ProfileCompletionBanner />
        </SafeAreaView>
    );
}