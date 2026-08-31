import { db } from "@/components/providers/SystemProvider";
import {
  getPhotoUploadService,
  isDriverDocType,
  localUriForPath,
  replaceDriverDocumentPhoto,
  saveToGalleryIfCamera,
  writeLocalPhoto,
  type PhotoSource,
} from "@/library/photoUploadQueue";
import { typeScale } from "@/constants/theme";
import { DocumentSection } from "@/features/profile/components/DocumentSection";
import { DocUploadStatusBanner } from "@/features/profile/components/DocUploadStatusBanner";
import { useDriverDocUploadStatuses } from "@/features/profile/hooks/useDriverDocUploadStatuses";
import { resolveDriverDocumentUri } from "@/features/profile/utils/resolveDriverDocumentUri";
import { useFormTheme } from "@/hooks/useTheme";
import { executeTypedMutation } from "@/library/powersync/typedMutation";
import { convertToJpegIfNeeded } from "@/utils/convertToJpeg";
import { blocksTripDate, DocSlug, tripBlockLabel } from "@/utils/documentExpiry";
import { promptForPhotos } from "@/utils/pickPhotos";
import { Ionicons } from "@expo/vector-icons";
import { randomUUID } from "expo-crypto";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface EditDocumentsFormProps {
  showMedCard: boolean;
  driverId: string | null;
  licensePath: string | null;
  insurancePath: string | null;
  medicalCardPath: string | null;
  licenseExpiresOn: string | null;
  insuranceExpiresOn: string | null;
  medicalCardExpiresOn: string | null;
  /** Section to scroll to on open — set by the banner / blocked trip. */
  focus?: DocSlug | null;
  /** Why the driver was sent here, in full sentences. */
  notice?: string | null;
  /** Date of the trip they could not accept, when they came from one. */
  tripDate?: string | null;
  onClose: () => void;
}

interface DocumentPhoto {
  uri: string | null;
  base64?: string;
  /** The attachment ID stored in the Drivers table (doubles as the storage path reference) */
  attachmentId?: string | null;
  /** True if this photo was newly picked/taken and needs uploading */
  isNew?: boolean;
  /** File extension extracted from the source URI (e.g. "jpg", "png", "pdf") */
  ext?: string;
  /** Capture source — only "camera" is duplicated to the gallery (§4). */
  source?: PhotoSource;
}

export default function EditDocumentsForm({
  showMedCard,
  driverId,
  licensePath,
  insurancePath,
  medicalCardPath,
  licenseExpiresOn,
  insuranceExpiresOn,
  medicalCardExpiresOn,
  focus = null,
  notice = null,
  tripDate = null,
  onClose,
}: EditDocumentsFormProps) {
  const [licensePhoto, setLicensePhoto] = useState<DocumentPhoto>({
    uri: licensePath ? getLocalUriForAttachment(licensePath) : null,
    attachmentId: licensePath,
  });
  const [insurancePhoto, setInsurancePhoto] = useState<DocumentPhoto>({
    uri: insurancePath ? getLocalUriForAttachment(insurancePath) : null,
    attachmentId: insurancePath,
  });
  const [medicalCardPhoto, setMedicalCardPhoto] = useState<DocumentPhoto>({
    uri: medicalCardPath ? getLocalUriForAttachment(medicalCardPath) : null,
    attachmentId: medicalCardPath,
  });
  const [licenseExpiry, setLicenseExpiry] = useState<string | null>(
    licenseExpiresOn,
  );
  const [insuranceExpiry, setInsuranceExpiry] = useState<string | null>(
    insuranceExpiresOn,
  );
  const [medicalCardExpiry, setMedicalCardExpiry] = useState<string | null>(
    medicalCardExpiresOn,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [replacingDocType, setReplacingDocType] = useState<string | null>(null);
  /** Missing expiry dates only turn red once the driver has tried to save. */
  const [showExpiryErrors, setShowExpiryErrors] = useState(false);

  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const sectionOffsets = useRef<Partial<Record<DocSlug, number>>>({});
  const didScrollToFocus = useRef(false);

  /**
   * The mount-time `uri` above is a local-file guess: correct for the common
   * case (this device captured the photo), wrong for one set outside the
   * queue (admin dashboard, a backfilled legacy path) with no local copy.
   * Verify each existing attachment once and swap in the bucket's public URL
   * when the guess was wrong — never for a freshly picked photo, which
   * `attachmentId !== path` excludes (its `attachmentId` is still the old
   * saved path, if any, not the new in-memory one).
   */
  useEffect(() => {
    let cancelled = false;

    const resolveInto = async (
      path: string | null,
      setter: React.Dispatch<React.SetStateAction<DocumentPhoto>>,
    ) => {
      if (!path) return;
      const uri = await resolveDriverDocumentUri(path);
      if (cancelled) return;
      setter((prev) =>
        prev.isNew || prev.attachmentId !== path ? prev : { ...prev, uri },
      );
    };

    void resolveInto(licensePath, setLicensePhoto);
    void resolveInto(insurancePath, setInsurancePhoto);
    void resolveInto(medicalCardPath, setMedicalCardPhoto);

    return () => {
      cancelled = true;
    };
  }, [licensePath, insurancePath, medicalCardPath]);

  const activePaths = [
    licensePhoto.attachmentId ?? licensePath,
    insurancePhoto.attachmentId ?? insurancePath,
    medicalCardPhoto.attachmentId ?? medicalCardPath,
  ];
  const { hasPending, hasFailed, canRetry, retryFailed, statuses, rows } =
    useDriverDocUploadStatuses(activePaths);

  const { form: theme, theme: appTheme } = useFormTheme();

  const pickImageFromLibrary = async (
    setter: React.Dispatch<React.SetStateAction<DocumentPhoto>>,
  ) => {
    // No permission request: this opens the system photo picker, which needs
    // none — and asking for one is what Google Play rejected the app for. See
    // `plugins/withMediaPermissionScrub.js` and `utils/pickPhotos.ts`.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const converted = await convertToJpegIfNeeded(
        asset.uri,
        asset.base64 ?? undefined,
      );
      setter({
        uri: converted.uri,
        base64: converted.base64,
        isNew: true,
        ext: converted.ext,
        source: "library",
      });
    }
  };

  const takePhoto = async (
    setter: React.Dispatch<React.SetStateAction<DocumentPhoto>>,
  ) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();

    if (status !== "granted") {
      Alert.alert(
        "Permission needed",
        "We need camera permissions to take photos",
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const converted = await convertToJpegIfNeeded(
        asset.uri,
        asset.base64 ?? undefined,
      );
      setter({
        uri: converted.uri,
        base64: converted.base64,
        isNew: true,
        ext: converted.ext,
        source: "camera",
      });
    }
  };

  const pickFile = async (
    setter: React.Dispatch<React.SetStateAction<DocumentPhoto>>,
  ) => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: ["image/*", "application/pdf"],
    });

    if (!result.canceled && result.assets[0]) {
      const pickedUri = result.assets[0].uri;
      const base64 = await FileSystem.readAsStringAsync(pickedUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const converted = await convertToJpegIfNeeded(pickedUri, base64);
      setter({
        uri: converted.uri,
        base64: converted.base64,
        isNew: true,
        ext: converted.ext,
        source: "file",
      });
    }
  };

  /**
   * Record a document photo for the custom upload queue: write the stable local
   * copy, then upsert the one DriverDocuments row for this (driver, doc_type)
   * with upload_status = pending (design doc §3). Returns the bucket path, which
   * is also mirrored onto Drivers.<doc>_photo_path for existing readers.
   */
  const savePhotoToQueue = async (
    photo: DocumentPhoto,
    docType: string,
  ): Promise<string | null> => {
    if (!photo.isNew || !photo.base64 || !driverId)
      return photo.attachmentId ?? null;

    const ext = photo.ext ?? "jpg";
    const ts = Date.now();
    const filename = `${driverId}/${docType}_${ts}.${ext}`;
    const localUri = await writeLocalPhoto(photo.base64, filename);

    // Camera captures are the only copy until now — duplicate to the gallery
    // as a safety backup (§4). Library/file sources are already persistent.
    void saveToGalleryIfCamera(localUri, photo.source);

    // PowerSync local tables carry no unique index, so upsert manually by
    // finding the existing (driver_uuid, doc_type) row.
    const existing = await db
      .selectFrom("DriverDocuments")
      .select("id")
      .where("driver_uuid", "=", driverId)
      .where("doc_type", "=", docType)
      .limit(1)
      .execute();

    if (existing.length > 0) {
      await executeTypedMutation(
        db
          .updateTable("DriverDocuments")
          .set({
            photo_path: filename,
            upload_status: "pending",
            attempts: 0,
            last_attempt_at: null,
            last_error: null,
          })
          .where("id", "=", existing[0].id)
          .compile(),
      );
    } else {
      await executeTypedMutation(
        db
          .insertInto("DriverDocuments")
          .values({
            id: randomUUID(),
            driver_uuid: driverId,
            doc_type: docType,
            photo_path: filename,
            upload_status: "pending",
            attempts: 0,
            created_at: new Date().toISOString(),
          })
          .compile(),
      );
    }

    return filename;
  };

  const handleSubmit = async () => {
    if (!driverId) {
      Alert.alert("Error", "Driver ID not found");
      return;
    }

    // Point at the offending field instead of naming it in an alert the
    // driver then has to go hunting for.
    const missingExpiry: DocSlug[] = [];
    if (!licenseExpiry) missingExpiry.push("license");
    if (!insuranceExpiry) missingExpiry.push("insurance");
    if (showMedCard && !medicalCardExpiry) missingExpiry.push("medical_card");

    if (missingExpiry.length > 0) {
      setShowExpiryErrors(true);
      scrollToSection(missingExpiry[0]);
      return;
    }

    setIsSubmitting(true);

    try {
      const [licenseId, insuranceId, medicalId] = await Promise.all([
        savePhotoToQueue(licensePhoto, "license"),
        savePhotoToQueue(insurancePhoto, "insurance"),
        savePhotoToQueue(medicalCardPhoto, "medical_card"),
      ]);

      const updateQuery = db
        .updateTable("Drivers")
        .set({
          license_photo_path: licenseId,
          insurance_photo_path: insuranceId,
          medical_card_photo_path: medicalId,
          license_expires_on: licenseExpiry,
          insurance_expires_on: insuranceExpiry,
          medical_card_expires_on: showMedCard ? medicalCardExpiry : null,
        })
        .where("id", "=", driverId)
        .compile();

      await executeTypedMutation(updateQuery);

      // Kick the queue: the user is here and waiting, so retry fast (§6/§7).
      void getPhotoUploadService()?.triggerFast();

      Alert.alert(
        "Saved",
        "Documents saved on this device. Upload to the cloud continues in the background — keep the app open until it finishes.",
        [{ text: "OK", onPress: onClose }],
      );
    } catch (error) {
      console.error("Error updating documents:", error);
      Alert.alert("Error", "Failed to update documents. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      const { retried, needRepick } = await retryFailed();
      if (needRepick > 0 && retried === 0) {
        Alert.alert(
          "Nothing left to retry",
          "The local files for those documents are gone. Once we confirm they never reached the server, you'll be able to replace them here.",
        );
      }
    } finally {
      setIsRetrying(false);
    }
  };

  /**
   * The row for this document is bucket-confirmed missing (§6.2) — replace it in
   * place. One row per (driver, doc_type), so there is nothing to reconcile: the
   * new photo takes over the existing row immediately, rather than waiting for
   * "Save Changes" like a routine re-pick does.
   */
  const handleReplaceDoc = async (
    docType: string,
    rowId: string,
    setter: React.Dispatch<React.SetStateAction<DocumentPhoto>>,
  ) => {
    if (!driverId || !isDriverDocType(docType)) return;

    const picked = await promptForPhotos({
      title: "Replace Document",
      message:
        "This document was never stored on the server. Add it again to fix it.",
      selectionLimit: 1,
    });
    if (picked.length === 0) return;

    setReplacingDocType(docType);
    try {
      const { bucketPath, localUri } = await replaceDriverDocumentPhoto({
        rowId,
        driverUuid: driverId,
        docType,
        picked: picked[0],
      });
      setter({
        uri: localUri,
        attachmentId: bucketPath,
        ext: picked[0].ext,
        source: picked[0].source,
      });
      Alert.alert(
        "Document replaced",
        "Upload has been queued. Keep the app open until it finishes.",
      );
    } catch (error) {
      console.error("Error replacing document:", error);
      Alert.alert("Error", "Could not replace the document. Please try again.");
    } finally {
      setReplacingDocType(null);
    }
  };

  const statusLabel = (attachmentId?: string | null) => {
    if (!attachmentId) return null;
    const status = statuses[attachmentId];
    if (status === "pending") return "Uploading…";
    if (status === "failed") return "Upload failed";
    if (status === "uploaded") return "Uploaded";
    return null;
  };

  const scrollToSection = (slug: DocSlug) => {
    const y = sectionOffsets.current[slug];
    if (y === undefined) return;
    scrollRef.current?.scrollTo({ y: Math.max(y - 12, 0), animated: true });
  };

  const handleSectionLayout = (slug: DocSlug) => (event: LayoutChangeEvent) => {
    sectionOffsets.current[slug] = event.nativeEvent.layout.y;
    // Land on the document the driver was sent here to fix, once we know
    // where it is. Only ever on the first layout pass.
    if (focus === slug && !didScrollToFocus.current) {
      didScrollToFocus.current = true;
      requestAnimationFrame(() => scrollToSection(slug));
    }
  };

  /**
   * Unsaved work: a freshly picked photo, a removed one, or an edited date.
   * A bucket-confirmed replacement is deliberately excluded — that path saves
   * itself immediately, so it is never pending here.
   */
  const isDirty =
    Boolean(licensePhoto.isNew || insurancePhoto.isNew || medicalCardPhoto.isNew) ||
    (licensePath !== null && licensePhoto.attachmentId === null) ||
    (insurancePath !== null && insurancePhoto.attachmentId === null) ||
    (medicalCardPath !== null && medicalCardPhoto.attachmentId === null) ||
    licenseExpiry !== licenseExpiresOn ||
    insuranceExpiry !== insuranceExpiresOn ||
    (showMedCard && medicalCardExpiry !== medicalCardExpiresOn);

  const handleCancel = () => {
    if (!isDirty) {
      onClose();
      return;
    }
    Alert.alert(
      "Discard changes?",
      "Your new photos and dates will not be saved.",
      [
        { text: "Keep editing", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: onClose },
      ],
    );
  };

  const sections: {
    slug: DocSlug;
    title: string;
    icon: string;
    photo: DocumentPhoto;
    setter: React.Dispatch<React.SetStateAction<DocumentPhoto>>;
    expiry: string | null;
    setExpiry: (date: string | null) => void;
  }[] = [
    {
      slug: "license",
      title: "Driver's License",
      icon: "card",
      photo: licensePhoto,
      setter: setLicensePhoto,
      expiry: licenseExpiry,
      setExpiry: setLicenseExpiry,
    },
    {
      slug: "insurance",
      title: "Certificate of Insurance",
      icon: "shield-checkmark",
      photo: insurancePhoto,
      setter: setInsurancePhoto,
      expiry: insuranceExpiry,
      setExpiry: setInsuranceExpiry,
    },
    ...(showMedCard
      ? [
          {
            slug: "medical_card" as DocSlug,
            title: "Medical Card",
            icon: "medical",
            photo: medicalCardPhoto,
            setter: setMedicalCardPhoto,
            expiry: medicalCardExpiry,
            setExpiry: setMedicalCardExpiry,
          },
        ]
      : []),
  ];

  /**
   * Recomputed from the dates on screen, not from the saved row, so the
   * highlight clears the moment the driver picks a valid date.
   */
  const tripBlockFor = (expiry: string | null) =>
    tripDate && blocksTripDate(expiry, tripDate)
      ? tripBlockLabel(expiry, tripDate)
      : null;
  const stillBlocked = sections.some((section) => tripBlockFor(section.expiry));

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.card,
            borderBottomColor: theme.border,
            paddingTop: insets.top + 12,
          },
        ]}
      >
        <TouchableOpacity onPress={handleCancel} style={styles.headerSide}>
          <Text style={[styles.cancelButton, { color: theme.accent }]}>
            Cancel
          </Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Edit Documents
        </Text>
        <View style={styles.headerSide} />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {notice && (!tripDate || stillBlocked) ? (
          <View
            style={[
              styles.notice,
              {
                backgroundColor: appTheme.danger + "14",
                borderColor: appTheme.danger,
              },
            ]}
          >
            <Ionicons
              name="alert-circle"
              size={18}
              color={appTheme.danger}
            />
            <Text style={[styles.noticeText, { color: theme.text }]}>
              {notice}
            </Text>
          </View>
        ) : null}

        <DocUploadStatusBanner
          hasPending={hasPending}
          hasFailed={hasFailed}
          isRetrying={isRetrying}
          canRetry={canRetry}
          onRetry={handleRetry}
        />

        {sections.map((section) => (
          <DocumentSection
            key={section.slug}
            title={section.title}
            iconName={section.icon}
            photoUri={section.photo.uri}
            uploadStatus={statusLabel(section.photo.attachmentId)}
            expiry={section.expiry}
            onChangeExpiry={section.setExpiry}
            onTakePhoto={() => takePhoto(section.setter)}
            onChoosePhoto={() => pickImageFromLibrary(section.setter)}
            onChooseFile={() => pickFile(section.setter)}
            onRemovePhoto={() =>
              section.setter({ uri: null, attachmentId: null })
            }
            docRow={
              section.photo.attachmentId
                ? rows[section.photo.attachmentId]
                : undefined
            }
            isReplacing={replacingDocType === section.slug}
            onReplace={(rowId) => {
              void handleReplaceDoc(section.slug, rowId, section.setter);
            }}
            showMissingExpiryError={showExpiryErrors}
            tripBlockNote={tripBlockFor(section.expiry)}
            onLayout={handleSectionLayout(section.slug)}
          />
        ))}
      </ScrollView>

      {/* Fixed footer: the save action stays under the driver's thumb instead
          of scrolling away below three tall document cards. */}
      <View
        style={[
          styles.footer,
          {
            backgroundColor: theme.card,
            borderTopColor: theme.border,
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.submitButton,
            { backgroundColor: theme.secondaryAccent },
            isSubmitting && { backgroundColor: theme.secondaryAccent + "66" },
          ]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color={theme.onSecondaryAccent} />
          ) : (
            <Text
              style={[
                styles.submitButtonText,
                { color: theme.onSecondaryAccent },
              ]}
            >
              Save Changes
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function getLocalUriForAttachment(attachmentId: string): string | null {
  if (!attachmentId) return null;
  return localUriForPath(attachmentId);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerSide: {
    minWidth: 60,
  },
  cancelButton: {
    ...typeScale.callout,
    fontWeight: "600",
  },
  headerTitle: {
    ...typeScale.title3,
    fontWeight: "700",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
  },
  noticeText: {
    ...typeScale.subhead,
    fontWeight: "600",
    flex: 1,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  submitButton: {
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  submitButtonText: {
    ...typeScale.callout,
    fontWeight: "600",
  },
});
