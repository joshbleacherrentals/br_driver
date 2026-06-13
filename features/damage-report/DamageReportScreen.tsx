import BleacherDropdown, { BleacherOption } from '@/components/widgets/bleacherDropdown';
import DamageSeveritySelector, {
  DamageSeverityValue,
  severityValueToEnum,
} from './components/DamageSeveritySelector';
import { DebugUploadTracker } from './components/DebugUploadTracker';
import {
  damageReportPhotoAttachmentQueue,
  db,
} from '@/components/providers/SystemProvider';
import { useAllBleachers } from '@/hooks/db/useBleacher';
import { useDriver } from '@/hooks/db/useDriver';
import { executeTypedMutation } from '@/library/powersync/typedMutation';
import { convertToJpegIfNeeded } from '@/utils/convertToJpeg';
import { persistPickerPhoto } from '@/utils/persistPickerPhoto';
import { readAsBase64 } from '@/utils/readAsBase64';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ━━━ Debug toggle ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const DEBUG_PHOTO_UPLOAD = true;
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface DebugLogEntry {
  ts: string;
  msg: string;
}

interface DocumentPhoto {
  uri: string | null;
  isNew?: boolean;
  ext?: string;
}

export default function DamageReportScreen() {
  const router = useRouter();
  const { bleachers } = useAllBleachers();
  const { driver } = useDriver();

  const bleacherOptions: BleacherOption[] = useMemo(
    () =>
      bleachers
        .filter((b) => !(b as any).deleted)
        .map((b) => ({
          uuid: b.id,
          bleacher_number: b.bleacher_number ?? '',
          bleacher_rows: b.bleacher_rows,
        })),
    [bleachers]
  );

  const [selectedBleacher, setSelectedBleacher] = useState<string | null>(null);
  const [seatDamage, setSeatDamage] = useState<DamageSeverityValue>(null);
  const [haulDamage, setHaulDamage] = useState<DamageSeverityValue>(null);
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<DocumentPhoto[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [debugLogs, setDebugLogs] = useState<DebugLogEntry[]>([]);
  const [trackedAttachmentIds, setTrackedAttachmentIds] = useState<string[]>([]);
  const debugScrollRef = useRef<ScrollView>(null);

  const dlog = useCallback((msg: string) => {
    const entry: DebugLogEntry = {
      ts: new Date().toISOString().slice(11, 23),
      msg,
    };
    console.log(`[DR-DEBUG] ${entry.ts} ${msg}`);
    if (DEBUG_PHOTO_UPLOAD) {
      setDebugLogs((prev) => [...prev, entry]);
    }
  }, []);

  const canSubmit =
    selectedBleacher &&
    (seatDamage !== null || haulDamage !== null) &&
    note.trim().length > 0 &&
    photos.length > 0 &&
    !isSubmitting;

  const addFromCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera permission is required to take photos');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled && result.assets?.length) {
      const asset = result.assets[0];
      dlog(`CAM: got asset uri=${asset.uri.slice(-40)}`);
      const converted = await convertToJpegIfNeeded(asset.uri);
      const persisted = await persistPickerPhoto(converted.uri, converted.ext);
      dlog(`CAM: persisted -> ${persisted.slice(-40)}`);
      setPhotos((prev) => [
        ...prev,
        { uri: persisted, isNew: true, ext: converted.ext },
      ]);
    }
  };

  const addFromLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Media library permission is required');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.8,
      allowsMultipleSelection: true,
    });
    if (!result.canceled && result.assets?.length) {
      dlog(`LIB: picker returned ${result.assets.length} assets`);
      const newPhotos: DocumentPhoto[] = [];
      for (let j = 0; j < result.assets.length; j++) {
        const asset = result.assets[j];
        try {
          const converted = await convertToJpegIfNeeded(asset.uri);
          const persisted = await persistPickerPhoto(converted.uri, converted.ext);
          const info = await FileSystem.getInfoAsync(persisted);
          const sizeKB = info.exists ? Math.round((info as any).size / 1024) : '??';
          dlog(`LIB[${j}]: persisted ${sizeKB}KB ext=${converted.ext}`);
          newPhotos.push({
            uri: persisted,
            isNew: true,
            ext: converted.ext,
          });
        } catch (err) {
          dlog(`LIB[${j}]: PERSIST FAILED - ${String(err).slice(0, 120)}`);
        }
      }
      dlog(`LIB: ${newPhotos.length}/${result.assets.length} persisted OK`);
      setPhotos((prev) => [...prev, ...newPhotos]);
    }
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!selectedBleacher) {
      Alert.alert('Required', 'Please select a bleacher');
      return;
    }
    if (seatDamage === null && haulDamage === null) {
      Alert.alert('Required', 'Please select at least one damage severity');
      return;
    }
    if (!note.trim()) {
      Alert.alert('Required', 'Please add damage notes');
      return;
    }
    if (photos.length === 0) {
      Alert.alert('Required', 'Please add at least one damage photo');
      return;
    }

    setIsSubmitting(true);
    dlog(`SUBMIT: starting with ${photos.length} photos`);
    try {
      const damageId = randomUUID();
      const now = new Date().toISOString();

      await executeTypedMutation(
        db
          .insertInto('DamageReports')
          .values({
            id: damageId,
            inspection_uuid: null,
            bleacher_uuid: selectedBleacher,
            is_safe_to_sit: seatDamage === null ? 1 : 0,
            is_safe_to_haul: haulDamage === null ? 1 : 0,
            seat_damage: severityValueToEnum(seatDamage),
            haul_damage: severityValueToEnum(haulDamage),
            note: note.trim() || null,
            created_at: now,
            resolved_at: null,
            maintenance_event_uuid: null,
            created_by_user_uuid: driver?.user_uuid ?? null,
          })
          .compile()
      );
      dlog(`SUBMIT: DamageReport row inserted id=${damageId.slice(0, 8)}`);

      if (damageReportPhotoAttachmentQueue) {
        // For each photo: save file to disk, then insert DamageReportPhotos row.
        // The base class reconciliation watches DamageReportPhotos, creates an
        // attachment record (with local_uri via newAttachmentRecord), finds the
        // local file we saved, and queues it for upload automatically.
        let savedCount = 0;
        let skipCount = 0;
        const filenames: string[] = [];
        for (let i = 0; i < photos.length; i++) {
          const photo = photos[i];
          if (!photo.isNew || !photo.uri) {
            skipCount++;
            dlog(`PHOTO[${i}]: SKIP isNew=${photo.isNew} uri=${!!photo.uri}`);
            continue;
          }
          try {
            const fileInfo = await FileSystem.getInfoAsync(photo.uri);
            if (!fileInfo.exists) {
              dlog(`PHOTO[${i}]: FILE MISSING uri=${photo.uri.slice(-40)}`);
              continue;
            }
            const fileSizeKB = Math.round(((fileInfo as any).size ?? 0) / 1024);
            dlog(`PHOTO[${i}]: reading ${fileSizeKB}KB from ${photo.uri.slice(-40)}`);

            const base64 = await readAsBase64(photo.uri);
            dlog(`PHOTO[${i}]: base64 len=${base64.length} (${Math.round(base64.length / 1024)}KB)`);

            const ext = photo.ext ?? 'jpg';
            const filename = `${damageId}/photo_${i}_${Date.now()}.${ext}`;

            await damageReportPhotoAttachmentQueue.savePhotoToDisk(base64, filename);
            dlog(`PHOTO[${i}]: saved to disk as ${filename.slice(-30)}`);

            await executeTypedMutation(
              db
                .insertInto('DamageReportPhotos')
                .values({
                  id: randomUUID(),
                  damage_report_uuid: damageId,
                  photo_path: filename,
                })
                .compile()
            );
            dlog(`PHOTO[${i}]: DB row inserted`);
            filenames.push(filename);
            savedCount++;
          } catch (err) {
            dlog(`PHOTO[${i}]: ERROR - ${String(err).slice(0, 150)}`);
          }
        }
        dlog(`SUBMIT: done saved=${savedCount} skipped=${skipCount} failed=${photos.length - savedCount - skipCount}`);
        if (DEBUG_PHOTO_UPLOAD) {
          setTrackedAttachmentIds(filenames);
        }
      } else {
        dlog('SUBMIT: NO attachment queue available!');
      }

      if (DEBUG_PHOTO_UPLOAD) {
        dlog('SUBMIT: success! Staying on page to watch uploads...');
        Alert.alert('Success', 'Damage report submitted. Stay on this page to watch upload progress.');
      } else {
        Alert.alert('Success', 'Damage report submitted', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      }
    } catch (error) {
      dlog(`SUBMIT: FATAL ERROR - ${String(error).slice(0, 200)}`);
      Alert.alert('Error', 'Failed to submit damage report. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Bleacher select */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Choose Bleacher</Text>
          <View style={styles.requiredBadge}>
            <Text style={styles.requiredText}>REQUIRED</Text>
          </View>
          <View style={{ marginTop: 10 }}>
            <BleacherDropdown
              options={bleacherOptions}
              selectedUuid={selectedBleacher}
              onChange={setSelectedBleacher}
              placeholder="Select bleacher…"
            />
          </View>
        </View>

        {/* Seat damage */}
        <View style={styles.section}>
          <DamageSeveritySelector
            label="Seating Configuration Damage"
            value={seatDamage}
            onChange={setSeatDamage}
          />
        </View>

        {/* Haul damage */}
        <View style={styles.section}>
          <DamageSeveritySelector
            label="Hauling Configuration Damage"
            value={haulDamage}
            onChange={setHaulDamage}
          />
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={styles.sectionTitle}>Damage Notes</Text>
            <View style={styles.requiredBadge}>
              <Text style={styles.requiredText}>REQUIRED</Text>
            </View>
          </View>
          <TextInput
            style={styles.textInput}
            value={note}
            onChangeText={setNote}
            placeholder="Describe the damage..."
            multiline
          />
        </View>

        {/* Photos */}
        <View style={styles.section}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={styles.sectionTitle}>Damage Photos ({photos.length})</Text>
            <View style={styles.requiredBadge}>
              <Text style={styles.requiredText}>REQUIRED</Text>
            </View>
          </View>
          <View style={styles.photoButtons}>
            <TouchableOpacity style={styles.photoButton} onPress={addFromCamera}>
              <View style={styles.iconContainer}>
                <Ionicons name="camera" size={20} color="#FFFFFF" />
              </View>
              <Text style={styles.photoButtonText}>Take Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.photoButton} onPress={addFromLibrary}>
              <View style={styles.iconContainer}>
                <Ionicons name="images" size={20} color="#FFFFFF" />
              </View>
              <Text style={styles.photoButtonText}>Choose from Library</Text>
            </TouchableOpacity>
          </View>
          {photos.length > 0 && (
            <View style={styles.photoGrid}>
              {photos.map((photo, index) => (
                <View key={index} style={styles.photoContainer}>
                  <Image source={{ uri: photo.uri ?? undefined }} style={styles.photo} />
                  <TouchableOpacity
                    style={styles.removePhotoButton}
                    onPress={() => removePhoto(index)}
                  >
                    <Ionicons name="close" size={16} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Submit */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
          >
            <Text style={styles.submitButtonText}>
              {isSubmitting ? 'Submitting...' : 'Submit Report'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Debug panel */}
        {DEBUG_PHOTO_UPLOAD && debugLogs.length > 0 && (
          <View style={debugStyles.container}>
            <View style={debugStyles.header}>
              <Text style={debugStyles.title}>Debug Log ({debugLogs.length})</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={debugStyles.copyBtn}
                  onPress={() => {
                    const text = debugLogs.map((l) => `${l.ts} ${l.msg}`).join('\n');
                    Clipboard.setStringAsync(text);
                    Alert.alert('Copied', `${debugLogs.length} log entries copied to clipboard`);
                  }}
                >
                  <Text style={debugStyles.copyBtnText}>Copy All</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[debugStyles.copyBtn, { backgroundColor: '#FF3B30' }]}
                  onPress={() => setDebugLogs([])}
                >
                  <Text style={debugStyles.copyBtnText}>Clear</Text>
                </TouchableOpacity>
              </View>
            </View>
            <ScrollView
              ref={debugScrollRef}
              style={debugStyles.logScroll}
              onContentSizeChange={() =>
                debugScrollRef.current?.scrollToEnd({ animated: false })
              }
            >
              {debugLogs.map((entry, i) => (
                <Text key={i} style={debugStyles.logLine} selectable>
                  <Text style={debugStyles.logTs}>{entry.ts} </Text>
                  <Text
                    style={
                      entry.msg.includes('ERROR') || entry.msg.includes('FAILED') || entry.msg.includes('MISSING')
                        ? debugStyles.logError
                        : entry.msg.includes('done')
                          ? debugStyles.logSuccess
                          : debugStyles.logMsg
                    }
                  >
                    {entry.msg}
                  </Text>
                </Text>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Upload tracker — watches attachment queue in real time */}
        {DEBUG_PHOTO_UPLOAD && (
          <DebugUploadTracker attachmentIds={trackedAttachmentIds} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  scrollContent: { padding: 16 },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  requiredBadge: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  requiredText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  textInput: {
    backgroundColor: '#F8F8F8',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginTop: 10,
  },
  photoButtons: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 16 },
  photoButton: {
    flex: 1,
    backgroundColor: '#0A84FF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  photoButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  iconContainer: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginLeft: 8,
  },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoContainer: { position: 'relative', width: 100, height: 100 },
  photo: { width: '100%', height: '100%', borderRadius: 8 },
  removePhotoButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#FF3B30',
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonContainer: { flexDirection: 'row', gap: 12, marginTop: 24, marginBottom: 32 },
  cancelButton: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: { fontSize: 16, fontWeight: '600', color: '#000' },
  submitButton: {
    flex: 2,
    backgroundColor: '#34C759',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonDisabled: { backgroundColor: '#A8E6B7' },
  submitButtonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
});

const debugStyles = StyleSheet.create({
  container: {
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    marginTop: 16,
    marginBottom: 32,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#2D2D2D',
  },
  title: { color: '#00FF00', fontSize: 13, fontWeight: '700', fontFamily: 'Courier' },
  copyBtn: {
    backgroundColor: '#0A84FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
  },
  copyBtnText: { color: '#FFF', fontSize: 11, fontWeight: '600' },
  logScroll: { maxHeight: 300, padding: 10 },
  logLine: { marginBottom: 2 },
  logTs: { color: '#888', fontSize: 10, fontFamily: 'Courier' },
  logMsg: { color: '#DDD', fontSize: 10, fontFamily: 'Courier' },
  logError: { color: '#FF6B6B', fontSize: 10, fontFamily: 'Courier', fontWeight: '700' },
  logSuccess: { color: '#00FF00', fontSize: 10, fontFamily: 'Courier', fontWeight: '700' },
});
