import LoadingScreen from "@/components/widgets/loadingScreen";
import EditDocumentsForm from "@/features/profile/components/EditDocumentsForm";
import { useAddress } from "@/hooks/db/useAddress";
import { isUSAddress } from "@/utils/addressCountry";
import { useDriver } from "@/hooks/db/useDriver";
import { useProfileCompletion } from "@/hooks/useProfileCompletion";
import { DocSlug } from "@/utils/documentExpiry";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";

const DOC_SLUGS: DocSlug[] = ["license", "insurance", "medical_card"];

function firstParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() ? raw : null;
}

function parseFocus(value: string | string[] | undefined): DocSlug | null {
  const raw = firstParam(value);
  return DOC_SLUGS.find((slug) => slug === raw) ?? null;
}

/**
 * Standalone Edit Documents screen.
 *
 * One destination for every entry point — the profile card, the expiry
 * banners, and the blocked Accept button — so a driver who is told "update
 * your license" lands on the license, not on a profile page they have to
 * navigate themselves. `?focus=<doc>` picks the section; `?tripDate=` lets the
 * screen restate why that trip was blocked, dates and all.
 */
export default function EditDocumentsScreen() {
  const router = useRouter();
  const { focus, tripDate } = useLocalSearchParams<{
    focus?: string;
    tripDate?: string;
  }>();

  const { driver } = useDriver();
  const { address } = useAddress(driver?.address_uuid ?? null);
  const isUSA = isUSAddress(address);
  const { getAcceptBlock } = useProfileCompletion();

  const close = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(tabs)/profile");
  };

  // The form seeds its fields from these props once, at mount. Rendering it
  // before the driver row has synced would freeze a screenful of empty
  // documents, so hold until the row is there.
  if (!driver) {
    return <LoadingScreen />;
  }

  const trip = firstParam(tripDate);
  const notice = trip ? (getAcceptBlock(trip)?.message ?? null) : null;

  return (
    <EditDocumentsForm
      key={driver.id}
      showMedCard={isUSA}
      driverId={driver.id}
      licensePath={driver.license_photo_path}
      insurancePath={driver.insurance_photo_path}
      medicalCardPath={driver.medical_card_photo_path}
      licenseExpiresOn={driver.license_expires_on}
      insuranceExpiresOn={driver.insurance_expires_on}
      medicalCardExpiresOn={driver.medical_card_expires_on}
      focus={parseFocus(focus)}
      notice={notice}
      tripDate={trip}
      onClose={close}
    />
  );
}
