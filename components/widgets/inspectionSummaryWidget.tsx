import BottomSheetModal from '@/components/ui/BottomSheetModal';
import {
  damageReportPhotoAttachmentQueue,
  inspectionPhotoAttachmentQueue,
} from '@/components/providers/SystemProvider';
import ZoomableImage from '@/components/widgets/ZoomableImage';
import { DamageReportData } from '@/hooks/db/useDamageReport';
import { InspectionData, parseInspectionAnswers } from '@/hooks/db/useInspection';
import { shareImage, supabasePublicObjectUrl } from '@/utils/shareImage';
import { Ionicons } from '@expo/vector-icons';
import { usePowerSyncQuery } from '@powersync/react-native';
import * as FileSystem from 'expo-file-system/legacy';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewToken,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const DISMISS_DISTANCE = 100;
const DISMISS_VELOCITY = 800;
const GALLERY_IMAGE_HEIGHT = SCREEN_HEIGHT * 0.65;

interface InspectionSummaryWidgetProps {
  inspection: InspectionData | null;
  damages: DamageReportData[];
  title: string;
  defaultExpanded?: boolean;
}

// ─── URI resolvers ────────────────────────────────────────────────────────────

function getInspectionPhotoUri(storagePath: string): string | null {
  if (!storagePath) return null;
  if (inspectionPhotoAttachmentQueue) {
    const localPath =
      inspectionPhotoAttachmentQueue.getLocalFilePathSuffix(storagePath);
    return inspectionPhotoAttachmentQueue.getLocalUri(localPath);
  }
  return supabasePublicObjectUrl('inspection-photos', storagePath) || null;
}

function getDamagePhotoUri(storagePath: string): string | null {
  if (!storagePath) return null;
  if (damageReportPhotoAttachmentQueue) {
    const localPath =
      damageReportPhotoAttachmentQueue.getLocalFilePathSuffix(storagePath);
    return damageReportPhotoAttachmentQueue.getLocalUri(localPath);
  }
  return supabasePublicObjectUrl('damage-report-photos', storagePath) || null;
}

async function resolveShareablePhotoUri(
  storagePath: string,
  localUri: string | null,
  bucket: 'inspection-photos' | 'damage-report-photos',
): Promise<string | null> {
  const fallback = supabasePublicObjectUrl(bucket, storagePath) || null;

  if (localUri) {
    try {
      const normalized = localUri.replace(
        /(file:\/\/|https?:\/\/)|\/\/+/g,
        (match, protocol) => (protocol ? protocol : '/'),
      );
      const { exists } = await FileSystem.getInfoAsync(normalized);
      if (exists) return normalized;
    } catch {
      // fall through to remote
    }
  }

  return fallback;
}

// ─── Lazy thumbnail: local file if present, else the public bucket URL ────────
// Old/resolved damage photos are no longer pre-cached, so they may have no local
// file. Try the local URI first (instant + offline); on error fall back to the
// public bucket URL (loads over the network); if that also fails, show a
// placeholder instead of a broken image.

function LazyStoragePhoto({
  storagePath,
  bucket,
  style,
}: {
  storagePath: string;
  bucket: 'inspection-photos' | 'damage-report-photos';
  style: any;
}) {
  const localUri =
    bucket === 'damage-report-photos'
      ? getDamagePhotoUri(storagePath)
      : getInspectionPhotoUri(storagePath);
  const publicUrl = supabasePublicObjectUrl(bucket, storagePath) || null;

  const [uri, setUri] = useState<string | null>(localUri ?? publicUrl);
  const [failed, setFailed] = useState(false);

  const handleError = useCallback(() => {
    if (uri && publicUrl && uri !== publicUrl) {
      setUri(publicUrl);
    } else {
      setFailed(true);
    }
  }, [uri, publicUrl]);

  if (!uri || failed) {
    return (
      <View style={[style, lazyPhotoStyles.placeholder]}>
        <Ionicons name="cloud-offline-outline" size={22} color="#8E8E93" />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={style}
      resizeMode="cover"
      onError={handleError}
    />
  );
}

const lazyPhotoStyles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(142,142,147,0.12)',
  },
});

// ─── Damage photo hook ────────────────────────────────────────────────────────

function useDamageReportPhotos(damageReportId: string | null): { storage_path: string }[] {
  const rows = usePowerSyncQuery<{ photo_path: string }>(
    `SELECT photo_path FROM "DamageReportPhotos" WHERE damage_report_uuid = ? AND photo_path IS NOT NULL`,
    damageReportId ? [damageReportId] : ['__none__']
  );
  return (rows ?? []).map((r) => ({ storage_path: r.photo_path }));
}

// ─── Severity helpers ─────────────────────────────────────────────────────────

function severityConfig(value: string | null): {
  label: string;
  color: string;
  bg: string;
  icon: 'checkmark-circle' | 'warning-outline' | 'warning';
} {
  if (value === 'minor') {
    return { label: 'Minor', color: '#FF9500', bg: '#FFF3E0', icon: 'warning-outline' };
  }
  if (value === 'major') {
    return { label: 'Major', color: '#FF3B30', bg: '#FFEBEA', icon: 'warning' };
  }
  return { label: 'None', color: '#34C759', bg: '#E8F9ED', icon: 'checkmark-circle' };
}

function SeverityBadge({ value }: { value: string | null }) {
  const cfg = severityConfig(value);
  return (
    <View style={[severityBadge.pill, { backgroundColor: cfg.bg }]}>
      <Ionicons name={cfg.icon} size={13} color={cfg.color} />
      <Text style={[severityBadge.text, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

// ─── Damage summary card ──────────────────────────────────────────────────────

function DamageCard({
  damage,
  onPhotoPress,
}: {
  damage: DamageReportData;
  onPhotoPress: (photos: { storage_path: string }[], index: number) => void;
}) {
  const photos = useDamageReportPhotos(damage.id);

  return (
    <View style={damageCard.container}>
      {/* Title row */}
      <View style={damageCard.titleRow}>
        <Ionicons name="warning" size={15} color="#FF3B30" />
        <Text style={damageCard.title}>Damage Found</Text>
      </View>

      {/* Seating configuration */}
      <View style={damageCard.row}>
        <Text style={damageCard.label}>Seating Configuration</Text>
        <SeverityBadge value={damage.seat_damage} />
      </View>

      {/* Hauling configuration */}
      <View style={[damageCard.row, { borderBottomWidth: photos.length > 0 || !!damage.note ? 1 : 0 }]}>
        <Text style={damageCard.label}>Hauling Configuration</Text>
        <SeverityBadge value={damage.haul_damage} />
      </View>

      {/* Notes */}
      {!!damage.note && (
        <View style={damageCard.notes}>
          <Text style={damageCard.notesLabel}>Notes</Text>
          <Text style={damageCard.notesText}>{damage.note}</Text>
        </View>
      )}

      {/* Damage photos */}
      {photos.length > 0 && (
        <View style={damageCard.photosSection}>
          <Text style={damageCard.photosLabel}>
            Damage Photos ({photos.length})
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={damageCard.photoRow}
          >
            {photos.map((photo, photoIndex) => (
              <TouchableOpacity
                key={photoIndex}
                style={damageCard.photoThumb}
                onPress={() => onPhotoPress(photos, photoIndex)}
                activeOpacity={0.8}
              >
                <LazyStoragePhoto
                  storagePath={photo.storage_path}
                  bucket="damage-report-photos"
                  style={damageCard.photoThumbImage}
                />
                <View style={damageCard.photoExpandIcon}>
                  <Ionicons name="expand-outline" size={14} color="#FFF" />
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

// ─── Photo gallery modal ──────────────────────────────────────────────────────

/**
 * Fullscreen photo viewer rendered as an overlay (not a nested Modal).
 * iOS cannot reliably present a second Modal on top of presentationStyle="pageSheet".
 * Swipe down to dismiss (matches iOS pageSheet / Android sheet behavior).
 * Pinch / double-tap zoom via ZoomableImage.
 */
type GalleryItem = {
  id: string;
  uri: string;
  storagePath: string;
};

function PhotoGalleryOverlay({
  photos,
  initialIndex,
  questionText,
  resolveUri,
  bucket,
  onClose,
}: {
  photos: { storage_path: string }[];
  initialIndex: number;
  questionText: string;
  resolveUri: (storagePath: string) => string | null;
  bucket: 'inspection-photos' | 'damage-report-photos';
  onClose: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isZoomed, setIsZoomed] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [items, setItems] = useState<GalleryItem[]>([]);
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);
  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 50,
  }).current;

  // Prefer local file; if missing (synced from another device), use Supabase URL
  // so the image still renders and share can download it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const resolved = await Promise.all(
        photos.map(async (p, i) => {
          const localUri = resolveUri(p.storage_path);
          const uri = await resolveShareablePhotoUri(
            p.storage_path,
            localUri,
            bucket,
          );
          if (!uri) return null;
          return {
            id: `${p.storage_path}-${i}`,
            uri,
            storagePath: p.storage_path,
          } satisfies GalleryItem;
        }),
      );
      if (!cancelled) {
        setItems(resolved.filter(Boolean) as GalleryItem[]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [photos, resolveUri, bucket]);

  const dismiss = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleShare = useCallback(async () => {
    const current = items[currentIndex];
    if (!current?.uri || isSharing) return;
    setIsSharing(true);
    try {
      await shareImage(current.uri, {
        filenamePrefix:
          bucket === 'damage-report-photos'
            ? 'damage-photo'
            : 'inspection-photo',
        fallbackUrl:
          supabasePublicObjectUrl(bucket, current.storagePath) || undefined,
      });
    } catch (error) {
      Alert.alert(
        'Share failed',
        error instanceof Error ? error.message : 'Could not share this photo.',
      );
    } finally {
      setIsSharing(false);
    }
  }, [items, currentIndex, isSharing, bucket]);

  const createDismissPan = useCallback(
    (enabled: boolean) =>
      Gesture.Pan()
        .enabled(enabled)
        .activeOffsetY(12)
        .failOffsetX([-30, 30])
        .onUpdate((e) => {
          const y = Math.max(0, e.translationY);
          translateY.value = y;
          opacity.value = Math.max(0.45, 1 - y / 350);
        })
        .onEnd((e) => {
          const shouldDismiss =
            e.translationY > DISMISS_DISTANCE ||
            e.velocityY > DISMISS_VELOCITY;
          if (shouldDismiss) {
            translateY.value = withTiming(
              SCREEN_HEIGHT,
              { duration: 200 },
              (finished) => {
                if (finished) runOnJS(dismiss)();
              },
            );
            opacity.value = withTiming(0, { duration: 180 });
          } else {
            translateY.value = withSpring(0, { damping: 22, stiffness: 220 });
            opacity.value = withTiming(1, { duration: 150 });
          }
        }),
    [dismiss, translateY, opacity],
  );

  // Header dismiss always works; list dismiss only when not zoomed.
  const headerPan = useMemo(() => createDismissPan(true), [createDismissPan]);
  const listPan = useMemo(
    () => createDismissPan(!isZoomed),
    [createDismissPan, isZoomed],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
        setIsZoomed(false);
      }
    },
    [],
  );

  return (
    <GestureHandlerRootView style={gallery.overlay} accessibilityViewIsModal>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <Animated.View style={[gallery.container, animatedStyle]}>
        <SafeAreaView style={gallery.safeArea} edges={['top', 'bottom']}>
          <GestureDetector gesture={headerPan}>
            <Animated.View style={gallery.header}>
              <TouchableOpacity
                style={gallery.closeButton}
                onPress={onClose}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={26} color="#FFF" />
              </TouchableOpacity>
              <View style={gallery.headerCenter}>
                <Text style={gallery.headerTitle} numberOfLines={1}>
                  {questionText}
                </Text>
                <Text style={gallery.headerSubtitle}>
                  {currentIndex + 1} / {items.length}
                </Text>
              </View>
              <TouchableOpacity
                style={gallery.shareButton}
                onPress={handleShare}
                disabled={isSharing || items.length === 0}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityLabel="Share photo"
              >
                {isSharing ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Ionicons name="share-outline" size={24} color="#FFF" />
                )}
              </TouchableOpacity>
            </Animated.View>
          </GestureDetector>

          {items.length === 0 ? (
            <View style={gallery.emptyContainer}>
              <Ionicons name="image-outline" size={64} color="#555" />
              <Text style={gallery.emptyText}>Photos not yet downloaded</Text>
              <Text style={gallery.emptySubtext}>
                They will appear once synced
              </Text>
            </View>
          ) : (
            <>
              <GestureDetector gesture={listPan}>
                <Animated.View style={gallery.listWrap}>
                  <FlatList
                    data={items}
                    horizontal
                    pagingEnabled
                    scrollEnabled={!isZoomed}
                    showsHorizontalScrollIndicator={false}
                    initialScrollIndex={Math.min(
                      initialIndex,
                      Math.max(items.length - 1, 0),
                    )}
                    getItemLayout={(_, index) => ({
                      length: SCREEN_WIDTH,
                      offset: SCREEN_WIDTH * index,
                      index,
                    })}
                    onViewableItemsChanged={onViewableItemsChanged}
                    viewabilityConfig={viewabilityConfig}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                      <ZoomableImage
                        item={item}
                        width={SCREEN_WIDTH}
                        height={GALLERY_IMAGE_HEIGHT}
                        slideHeight={GALLERY_IMAGE_HEIGHT}
                        onZoomChange={setIsZoomed}
                      />
                    )}
                  />
                </Animated.View>
              </GestureDetector>
              {items.length > 1 && (
                <View style={gallery.dots}>
                  {items.map((_, i) => (
                    <View
                      key={i}
                      style={[
                        gallery.dot,
                        i === currentIndex && gallery.dotActive,
                      ]}
                    />
                  ))}
                </View>
              )}
            </>
          )}
        </SafeAreaView>
      </Animated.View>
    </GestureHandlerRootView>
  );
}

// ─── Gallery state type ───────────────────────────────────────────────────────

type GalleryState = {
  photos: { storage_path: string }[];
  questionText: string;
  initialIndex: number;
  isDamage: boolean;
};

// ─── Full inspection detail modal ─────────────────────────────────────────────

export function InspectionDetailModal({
  visible,
  inspection,
  damages,
  title,
  onClose,
}: {
  visible: boolean;
  inspection: InspectionData;
  damages: DamageReportData[];
  title: string;
  onClose: () => void;
}) {
  const [galleryState, setGalleryState] = useState<GalleryState | null>(null);

  const answers = parseInspectionAnswers(inspection.answers_json);
  const damage = damages.find((d) => d.inspection_uuid === inspection.id) ?? null;
  const hasDamage = !!damage;

  const formatDateTime = (iso?: string | null) => {
    if (!iso) return '';
    try { return new Date(iso).toLocaleString(); } catch { return iso ?? ''; }
  };

  const handleRequestClose = useCallback(() => {
    if (galleryState) {
      setGalleryState(null);
      return;
    }
    onClose();
  }, [galleryState, onClose]);

  const handleSheetDismiss = useCallback(() => {
    setGalleryState(null);
    onClose();
  }, [onClose]);

  const body = (
    <SafeAreaProvider>
      <View style={detail.container}>
        <SafeAreaView style={detail.safeArea} edges={['top', 'bottom']}>
          {/* Header */}
          <View style={detail.header}>
            <Text style={detail.headerTitle}>{title}</Text>
            <TouchableOpacity style={detail.closeBtn} onPress={onClose}>
              <Ionicons name="close-circle" size={28} color="#8E8E93" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={detail.scrollContent}>
            <Text style={detail.timestamp}>
              Completed: {formatDateTime(inspection.created_at)}
            </Text>

            {/* Dynamic inspection answers */}
            {answers.map((answer, index) => (
              <View key={index} style={detail.answerCard}>
                <Text style={detail.answerCardLabel}>{answer.question_text}</Text>

                {answer.question_type === 'checkbox' && (
                  <View style={detail.answerCardValue}>
                    {answer.answer_boolean ? (
                      <>
                        <Ionicons name="checkmark-circle" size={20} color="#34C759" />
                        <Text style={[detail.answerValueText, { color: '#34C759' }]}>Yes</Text>
                      </>
                    ) : (
                      <>
                        <Ionicons name="close-circle" size={20} color="#FF3B30" />
                        <Text style={[detail.answerValueText, { color: '#FF3B30' }]}>No</Text>
                      </>
                    )}
                  </View>
                )}

                {answer.question_type === 'text' && (
                  <Text style={detail.answerTextValue}>
                    {answer.answer_text?.trim() || '—'}
                  </Text>
                )}

                {answer.question_type === 'photo' && (
                  <>
                    {(!answer.photos || answer.photos.length === 0) ? (
                      <Text style={detail.noPhotosText}>No photos taken</Text>
                    ) : (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={detail.photoRow}
                      >
                        {answer.photos.map((photo, photoIndex) => (
                          <TouchableOpacity
                            key={photoIndex}
                            style={detail.photoThumb}
                            onPress={() =>
                              setGalleryState({
                                photos: answer.photos!,
                                questionText: answer.question_text,
                                initialIndex: photoIndex,
                                isDamage: false,
                              })
                            }
                            activeOpacity={0.8}
                          >
                            <LazyStoragePhoto
                              storagePath={photo.storage_path}
                              bucket="inspection-photos"
                              style={detail.photoThumbImage}
                            />
                            <View style={detail.photoExpandIcon}>
                              <Ionicons name="expand-outline" size={14} color="#FFF" />
                            </View>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    )}
                  </>
                )}
              </View>
            ))}

            {/* Damage card — includes photos fetched from DamageReportPhotos */}
            {hasDamage && (
              <DamageCard
                damage={damage!}
                onPhotoPress={(photos, index) =>
                  setGalleryState({
                    photos,
                    questionText: 'Damage Photos',
                    initialIndex: index,
                    isDamage: true,
                  })
                }
              />
            )}
          </ScrollView>
        </SafeAreaView>

        {/* Overlay inside sheet — nested Modal does not present on iOS */}
          {galleryState && (
            <PhotoGalleryOverlay
              photos={galleryState.photos}
              initialIndex={galleryState.initialIndex}
              questionText={galleryState.questionText}
              resolveUri={
                galleryState.isDamage ? getDamagePhotoUri : getInspectionPhotoUri
              }
              bucket={
                galleryState.isDamage
                  ? 'damage-report-photos'
                  : 'inspection-photos'
              }
              onClose={() => setGalleryState(null)}
            />
          )}
      </View>
    </SafeAreaProvider>
  );

  // iOS: native pageSheet already supports swipe-to-dismiss.
  if (Platform.OS === 'ios') {
    return (
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleRequestClose}
      >
        {body}
      </Modal>
    );
  }

  // Android: reuse shared bottom-sheet with drag handle + swipe-to-dismiss.
  return (
    <BottomSheetModal
      visible={visible}
      onClose={handleSheetDismiss}
      onRequestClose={handleRequestClose}
      onDragDismiss={
        galleryState ? () => setGalleryState(null) : undefined
      }
    >
      {body}
    </BottomSheetModal>
  );
}

// ─── Main widget ──────────────────────────────────────────────────────────────

export default function InspectionSummaryWidget({
  inspection,
  damages,
  title,
  defaultExpanded = false,
}: InspectionSummaryWidgetProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [detailVisible, setDetailVisible] = useState(false);

  if (!inspection) return null;

  // Derive the damage report that belongs to this specific inspection
  const damage = damages.find((d) => d.inspection_uuid === inspection.id) ?? null;

  const answers = parseInspectionAnswers(inspection.answers_json);
  const photoAnswers = answers.filter(
    (a) => a.question_type === 'photo' && (a.photos?.length ?? 0) > 0
  );
  const totalPhotos = photoAnswers.reduce((sum, a) => sum + (a.photos?.length ?? 0), 0);
  const hasDamage = !!damage;

  const formatDateTime = (iso?: string | null) => {
    if (!iso) return '';
    try { return new Date(iso).toLocaleString(); } catch { return iso ?? ''; }
  };

  return (
    <>
      <View style={styles.container}>
        {/* Collapsible header */}
        <TouchableOpacity
          style={styles.header}
          onPress={() => setExpanded((v) => !v)}
          activeOpacity={0.7}
        >
          <View style={styles.headerLeft}>
            <Ionicons name="clipboard-outline" size={18} color="#34C759" />
            <View style={styles.headerText}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{formatDateTime(inspection.created_at)}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            {hasDamage && (
              <View style={styles.damagePill}>
                <Ionicons name="warning" size={12} color="#FF3B30" />
                <Text style={styles.damagePillText}>Damage</Text>
              </View>
            )}
            <View style={styles.completedPill}>
              <Ionicons name="checkmark-circle" size={13} color="#34C759" />
              <Text style={styles.completedPillText}>Completed</Text>
            </View>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color="#8E8E93"
            />
          </View>
        </TouchableOpacity>

        {/* Expanded summary */}
        {expanded && (
          <View style={styles.body}>
            {answers.map((answer, index) => (
              <View
                key={index}
                style={[
                  styles.answerRow,
                  index === answers.length - 1 && !totalPhotos && !hasDamage && styles.answerRowLast,
                ]}
              >
                <Text style={styles.answerLabel}>{answer.question_text}</Text>
                <View style={styles.answerValue}>
                  {answer.question_type === 'checkbox' && (
                    answer.answer_boolean ? (
                      <>
                        <Ionicons name="checkmark-circle" size={16} color="#34C759" />
                        <Text style={[styles.answerValueText, { color: '#34C759' }]}>Yes</Text>
                      </>
                    ) : (
                      <>
                        <Ionicons name="close-circle" size={16} color="#FF3B30" />
                        <Text style={[styles.answerValueText, { color: '#FF3B30' }]}>No</Text>
                      </>
                    )
                  )}
                  {answer.question_type === 'text' && (
                    <Text style={styles.answerValueText} numberOfLines={1}>
                      {answer.answer_text?.trim() || '—'}
                    </Text>
                  )}
                  {answer.question_type === 'photo' && (
                    <View style={styles.photoPill}>
                      <Ionicons name="images-outline" size={13} color="#0A84FF" />
                      <Text style={styles.photoPillText}>
                        {answer.photos?.length ?? 0} photo{(answer.photos?.length ?? 0) !== 1 ? 's' : ''}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            ))}

            {/* Inline damage summary (collapsed view) */}
            {hasDamage && (
              <View style={styles.damageSummaryBlock}>
                <View style={styles.damageSummaryTitle}>
                  <Ionicons name="warning" size={14} color="#FF3B30" />
                  <Text style={styles.damageSummaryTitleText}>Damage Found</Text>
                </View>

                <View style={styles.damageSummaryRow}>
                  <Text style={styles.damageSummaryLabel}>Seating Config</Text>
                  <SeverityBadge value={damage!.seat_damage} />
                </View>

                <View style={[styles.damageSummaryRow, { borderBottomWidth: 0 }]}>
                  <Text style={styles.damageSummaryLabel}>Hauling Config</Text>
                  <SeverityBadge value={damage!.haul_damage} />
                </View>
              </View>
            )}

            <TouchableOpacity
              style={styles.viewFullButton}
              onPress={() => setDetailVisible(true)}
            >
              <Ionicons name="document-text-outline" size={16} color="#0A84FF" />
              <Text style={styles.viewFullText}>
                View Full Inspection{totalPhotos > 0 ? ` · ${totalPhotos} photo${totalPhotos !== 1 ? 's' : ''}` : ''}
              </Text>
              <Ionicons name="chevron-forward" size={16} color="#0A84FF" />
            </TouchableOpacity>
          </View>
        )}

        {/* Collapsed quick-access */}
        {!expanded && (totalPhotos > 0 || hasDamage) && (
          <TouchableOpacity
            style={styles.collapsedPhotoButton}
            onPress={() => setDetailVisible(true)}
          >
            {hasDamage && <Ionicons name="warning" size={14} color="#FF3B30" />}
            {totalPhotos > 0 && <Ionicons name="images-outline" size={14} color="#0A84FF" />}
            <Text style={[styles.collapsedPhotoText, hasDamage && { color: '#FF3B30' }]}>
              {hasDamage
                ? `Damage report${totalPhotos > 0 ? ` · ${totalPhotos} photo${totalPhotos !== 1 ? 's' : ''}` : ''}`
                : `View ${totalPhotos} photo${totalPhotos !== 1 ? 's' : ''}`}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <InspectionDetailModal
        visible={detailVisible}
        inspection={inspection}
        damages={damages}
        title={title}
        onClose={() => setDetailVisible(false)}
      />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { backgroundColor: '#FFFFFF', borderRadius: 10, marginTop: 10, borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#F8FFF9' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  headerText: { flex: 1 },
  title: { fontSize: 14, fontWeight: '600', color: '#000' },
  subtitle: { fontSize: 11, color: '#8E8E93', marginTop: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  completedPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#E8F9ED', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  completedPillText: { fontSize: 11, fontWeight: '600', color: '#34C759' },
  damagePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFEBEA', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  damagePillText: { fontSize: 11, fontWeight: '600', color: '#FF3B30' },
  body: { paddingHorizontal: 14, paddingBottom: 4, borderTopWidth: 1, borderTopColor: '#F2F2F7' },
  answerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F2F2F7' },
  answerRowLast: { borderBottomWidth: 0 },
  answerLabel: { fontSize: 13, color: '#3C3C3C', flex: 1, marginRight: 12 },
  answerValue: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  answerValueText: { fontSize: 13, fontWeight: '500', color: '#000' },
  photoPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EBF5FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  photoPillText: { fontSize: 11, fontWeight: '600', color: '#0A84FF' },
  damageSummaryBlock: { borderTopWidth: 1, borderTopColor: '#F2F2F7', paddingTop: 10, marginBottom: 4 },
  damageSummaryTitle: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  damageSummaryTitleText: { fontSize: 13, fontWeight: '700', color: '#FF3B30' },
  damageSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F2F2F7' },
  damageSummaryLabel: { fontSize: 13, color: '#3C3C3C' },
  viewFullButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, justifyContent: 'center', borderTopWidth: 1, borderTopColor: '#F2F2F7', marginTop: 4 },
  viewFullText: { fontSize: 14, fontWeight: '600', color: '#0A84FF' },
  collapsedPhotoButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 14, justifyContent: 'center', borderTopWidth: 1, borderTopColor: '#F2F2F7' },
  collapsedPhotoText: { fontSize: 13, fontWeight: '600', color: '#0A84FF' },
});

const detail = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  safeArea: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#000' },
  closeBtn: { padding: 4 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  timestamp: { fontSize: 12, color: '#8E8E93', marginBottom: 16 },
  answerCard: { backgroundColor: '#FFF', borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  answerCardLabel: { fontSize: 13, fontWeight: '600', color: '#8E8E93', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  answerCardValue: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  answerValueText: { fontSize: 16, fontWeight: '600' },
  answerTextValue: { fontSize: 15, color: '#000', lineHeight: 22 },
  photoRow: { marginTop: 4 },
  photoThumb: { width: 100, height: 100, borderRadius: 8, marginRight: 8, overflow: 'hidden', backgroundColor: '#F2F2F7' },
  photoThumbImage: { width: '100%', height: '100%' },
  photoExpandIcon: { position: 'absolute', bottom: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 4, padding: 3 },
  photoThumbPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  photoThumbPlaceholderText: { fontSize: 10, color: '#8E8E93', textAlign: 'center' },
  noPhotosText: { fontSize: 13, color: '#8E8E93', fontStyle: 'italic' },
});

const gallery = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 100,
  },
  container: { flex: 1, backgroundColor: '#000' },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 56,
  },
  closeButton: { width: 40, alignItems: 'flex-start' },
  shareButton: { width: 40, alignItems: 'flex-end', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 15, fontWeight: '600', color: '#FFF' },
  headerSubtitle: { fontSize: 12, color: '#8E8E93', marginTop: 2 },
  listWrap: { flex: 1 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 16 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#555' },
  dotActive: { backgroundColor: '#FFF', width: 18 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#8E8E93' },
  emptySubtext: { fontSize: 13, color: '#555' },
});

const damageCard = StyleSheet.create({
  container: { backgroundColor: '#FFF', borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#FFCDD2' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  title: { fontSize: 14, fontWeight: '700', color: '#FF3B30' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F2F2F7' },
  label: { fontSize: 14, color: '#3C3C3C', fontWeight: '500' },
  notes: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F2F2F7' },
  notesLabel: { fontSize: 11, fontWeight: '600', color: '#8E8E93', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  notesText: { fontSize: 14, color: '#000', lineHeight: 20 },
  photosSection: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F2F2F7' },
  photosLabel: { fontSize: 11, fontWeight: '600', color: '#8E8E93', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },
  photoRow: { flexDirection: 'row' },
  photoThumb: { width: 100, height: 100, borderRadius: 8, marginRight: 8, overflow: 'hidden', backgroundColor: '#F2F2F7' },
  photoThumbImage: { width: '100%', height: '100%' },
  photoExpandIcon: { position: 'absolute', bottom: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 4, padding: 3 },
  photoThumbPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  photoThumbPlaceholderText: { fontSize: 10, color: '#8E8E93', textAlign: 'center' },
});

const severityBadge = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  text: { fontSize: 12, fontWeight: '600' },
});