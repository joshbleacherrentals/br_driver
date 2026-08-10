import Badge from '@/components/ui/Badge';
import BottomSheetModal from '@/components/ui/BottomSheetModal';
import { localUriForPath } from '@/library/photoUploadQueue';
import ZoomableImage from '@/components/widgets/ZoomableImage';
import { ThemeColors, radius, themes, typeScale } from "@/constants/theme";
import { DamageReportData } from '@/hooks/db/useDamageReport';
import { InspectionData, parseInspectionAnswers } from '@/hooks/db/useInspection';
import { useTheme } from '@/hooks/useTheme';
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
  /** When true, removes extra top margin (e.g. nested under a location card). */
  embedded?: boolean;
}

// The deterministic local copy for a bucket path (callers fall back to the
// public URL when the local file is absent — e.g. a photo from another device).
function getInspectionPhotoUri(storagePath: string): string | null {
  if (!storagePath) return null;
  return localUriForPath(storagePath);
}

function getDamagePhotoUri(storagePath: string): string | null {
  if (!storagePath) return null;
  return localUriForPath(storagePath);
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

function LazyStoragePhoto({
  storagePath,
  bucket,
  style,
}: {
  storagePath: string;
  bucket: 'inspection-photos' | 'damage-report-photos';
  style: object;
}) {
  const { theme } = useTheme();
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
      <View
        style={[
          style,
          {
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.textTertiary + '1F',
          },
        ]}
      >
        <Ionicons name="cloud-offline-outline" size={22} color={theme.textTertiary} />
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

function useDamageReportPhotos(damageReportId: string | null): { storage_path: string }[] {
  const rows = usePowerSyncQuery<{ photo_path: string }>(
    `SELECT photo_path FROM "DamageReportPhotos" WHERE damage_report_uuid = ? AND photo_path IS NOT NULL`,
    damageReportId ? [damageReportId] : ['__none__']
  );
  return (rows ?? []).map((r) => ({ storage_path: r.photo_path }));
}

function severityConfig(theme: ThemeColors, value: string | null): {
  label: string;
  color: string;
  bg: string;
  icon: 'checkmark-circle' | 'warning-outline' | 'warning';
} {
  if (value === 'minor') {
    return {
      label: 'Minor',
      color: theme.warning,
      bg: theme.warning + '18',
      icon: 'warning-outline',
    };
  }
  if (value === 'major') {
    return {
      label: 'Major',
      color: theme.danger,
      bg: theme.danger + '18',
      icon: 'warning',
    };
  }
  return {
    label: 'None',
    color: theme.success,
    bg: theme.secondaryAccentSoft,
    icon: 'checkmark-circle',
  };
}

function SeverityBadge({ value }: { value: string | null }) {
  const { theme } = useTheme();
  const cfg = severityConfig(theme, value);
  return (
    <View style={[severityBadge.pill, { backgroundColor: cfg.bg }]}>
      <Ionicons name={cfg.icon} size={13} color={cfg.color} />
      <Text style={[severityBadge.text, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

function DamageCard({
  damage,
  onPhotoPress,
}: {
  damage: DamageReportData;
  onPhotoPress: (photos: { storage_path: string }[], index: number) => void;
}) {
  const { theme } = useTheme();
  const damageCard = makeDamageCardStyles(theme);
  const photos = useDamageReportPhotos(damage.id);

  return (
    <View style={damageCard.container}>
      <View style={damageCard.titleRow}>
        <Ionicons name="warning" size={15} color={theme.danger} />
        <Text style={damageCard.title}>Damage Found</Text>
      </View>

      <View style={damageCard.row}>
        <Text style={damageCard.label}>Seating Configuration</Text>
        <SeverityBadge value={damage.seat_damage} />
      </View>

      <View style={[damageCard.row, { borderBottomWidth: photos.length > 0 || !!damage.note ? 1 : 0 }]}>
        <Text style={damageCard.label}>Hauling Configuration</Text>
        <SeverityBadge value={damage.haul_damage} />
      </View>

      {!!damage.note && (
        <View style={damageCard.notes}>
          <Text style={damageCard.notesLabel}>Notes</Text>
          <Text style={damageCard.notesText}>{damage.note}</Text>
        </View>
      )}

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
                  <Ionicons name="expand-outline" size={14} color={theme.onAccent} />
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

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
  const viewerTheme = themes.dark;
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isZoomed, setIsZoomed] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [items, setItems] = useState<GalleryItem[]>([]);
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);
  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 50,
  }).current;

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
      <StatusBar
        barStyle="light-content"
        backgroundColor={viewerTheme.background}
      />
      <Animated.View style={[gallery.container, animatedStyle]}>
        <SafeAreaView style={gallery.safeArea} edges={['top', 'bottom']}>
          <GestureDetector gesture={headerPan}>
            <Animated.View style={gallery.header}>
              <TouchableOpacity
                style={gallery.closeButton}
                onPress={onClose}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={26} color={viewerTheme.onAccent} />
              </TouchableOpacity>
              <View style={gallery.headerCenter}>
                <Text style={[gallery.headerTitle, { color: viewerTheme.onAccent }]} numberOfLines={1}>
                  {questionText}
                </Text>
                <Text style={[gallery.headerSubtitle, { color: viewerTheme.textTertiary }]}>
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
                  <ActivityIndicator size="small" color={viewerTheme.onAccent} />
                ) : (
                  <Ionicons name="share-outline" size={24} color={viewerTheme.onAccent} />
                )}
              </TouchableOpacity>
            </Animated.View>
          </GestureDetector>

          {items.length === 0 ? (
            <View style={gallery.emptyContainer}>
              <Ionicons name="image-outline" size={64} color={viewerTheme.textTertiary} />
              <Text style={[gallery.emptyText, { color: viewerTheme.textTertiary }]}>
                Photos not yet downloaded
              </Text>
              <Text style={[gallery.emptySubtext, { color: viewerTheme.textTertiary }]}>
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
                        i === currentIndex && [
                          gallery.dotActive,
                          { backgroundColor: viewerTheme.onAccent },
                        ],
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

type GalleryState = {
  photos: { storage_path: string }[];
  questionText: string;
  initialIndex: number;
  isDamage: boolean;
};

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
  const { theme } = useTheme();
  const detail = makeDetailStyles(theme);
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
          <View style={detail.header}>
            <Text style={detail.headerTitle}>{title}</Text>
            <TouchableOpacity style={detail.closeBtn} onPress={onClose}>
              <Ionicons name="close-circle" size={28} color={theme.textTertiary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={detail.scrollContent}>
            <Text style={detail.timestamp}>
              Completed: {formatDateTime(inspection.created_at)}
            </Text>

            {answers.map((answer, index) => (
              <View key={index} style={detail.answerCard}>
                <Text style={detail.answerCardLabel}>{answer.question_text}</Text>

                {answer.question_type === 'checkbox' && (
                  <View style={detail.answerCardValue}>
                    {answer.answer_boolean ? (
                      <>
                        <Ionicons name="checkmark-circle" size={20} color={theme.success} />
                        <Text style={[detail.answerValueText, { color: theme.success }]}>Yes</Text>
                      </>
                    ) : (
                      <>
                        <Ionicons name="close-circle" size={20} color={theme.danger} />
                        <Text style={[detail.answerValueText, { color: theme.danger }]}>No</Text>
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
                              <Ionicons name="expand-outline" size={14} color={theme.onAccent} />
                            </View>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    )}
                  </>
                )}
              </View>
            ))}

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

export default function InspectionSummaryWidget({
  inspection,
  damages,
  title,
  defaultExpanded = false,
  embedded = false,
}: InspectionSummaryWidgetProps) {
  const { theme } = useTheme();
  const styles = makeSummaryStyles(theme, embedded);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [detailVisible, setDetailVisible] = useState(false);

  if (!inspection) return null;

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
        <TouchableOpacity
          style={styles.header}
          onPress={() => setExpanded((v) => !v)}
          activeOpacity={0.7}
        >
          <View style={styles.headerLeft}>
            <Ionicons name="clipboard-outline" size={18} color={theme.success} />
            <View style={styles.headerText}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{formatDateTime(inspection.created_at)}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            {hasDamage && (
              <Badge label="Damage" color={theme.danger} icon="warning" />
            )}
            <Badge
              label="Completed"
              color={theme.success}
              icon="checkmark-circle"
            />
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={theme.textTertiary}
            />
          </View>
        </TouchableOpacity>

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
                        <Ionicons name="checkmark-circle" size={16} color={theme.success} />
                        <Text style={[styles.answerValueText, { color: theme.success }]}>Yes</Text>
                      </>
                    ) : (
                      <>
                        <Ionicons name="close-circle" size={16} color={theme.danger} />
                        <Text style={[styles.answerValueText, { color: theme.danger }]}>No</Text>
                      </>
                    )
                  )}
                  {answer.question_type === 'text' && (
                    <Text style={styles.answerValueText} numberOfLines={1}>
                      {answer.answer_text?.trim() || '—'}
                    </Text>
                  )}
                  {answer.question_type === 'photo' && (
                    <Badge
                      label={`${answer.photos?.length ?? 0} photo${(answer.photos?.length ?? 0) !== 1 ? 's' : ''}`}
                      color={theme.accent}
                      icon="images-outline"
                    />
                  )}
                </View>
              </View>
            ))}

            {hasDamage && (
              <View style={styles.damageSummaryBlock}>
                <View style={styles.damageSummaryTitle}>
                  <Ionicons name="warning" size={14} color={theme.danger} />
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
              <Ionicons name="document-text-outline" size={16} color={theme.accent} />
              <Text style={styles.viewFullText}>
                View Full Inspection{totalPhotos > 0 ? ` · ${totalPhotos} photo${totalPhotos !== 1 ? 's' : ''}` : ''}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={theme.accent} />
            </TouchableOpacity>
          </View>
        )}

        {!expanded && (totalPhotos > 0 || hasDamage) && (
          <TouchableOpacity
            style={styles.collapsedPhotoButton}
            onPress={() => setDetailVisible(true)}
          >
            {hasDamage && <Ionicons name="warning" size={14} color={theme.danger} />}
            {totalPhotos > 0 && <Ionicons name="images-outline" size={14} color={theme.accent} />}
            <Text
              style={[
                styles.collapsedPhotoText,
                hasDamage ? { color: theme.danger } : null,
              ]}
            >
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

function makeSummaryStyles(theme: ThemeColors, embedded = false) {
  const fill = embedded ? theme.surfaceElevated : theme.surface;
  return StyleSheet.create({
    container: {
      backgroundColor: fill,
      borderRadius: embedded ? 0 : 10,
      borderBottomLeftRadius: embedded ? radius.card : 10,
      borderBottomRightRadius: embedded ? radius.card : 10,
      marginTop: embedded ? 0 : 10,
      borderWidth: embedded ? StyleSheet.hairlineWidth : 1,
      borderColor: theme.border,
      borderTopWidth: embedded ? 0 : 1,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: theme.secondaryAccentSoft,
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    headerText: { flex: 1 },
    title: { ...typeScale.subhead, fontWeight: '600', color: theme.textPrimary },
    subtitle: { ...typeScale.caption2, color: theme.textTertiary, marginTop: 1 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    body: {
      paddingHorizontal: 14,
      paddingBottom: 4,
      borderTopWidth: 1,
      borderTopColor: theme.separator,
    },
    answerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.separator,
    },
    answerRowLast: { borderBottomWidth: 0 },
    answerLabel: { ...typeScale.footnote, color: theme.textSecondary, flex: 1, marginRight: 12 },
    answerValue: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    answerValueText: { ...typeScale.footnote, fontWeight: "400", color: theme.textPrimary },
    damageSummaryBlock: {
      borderTopWidth: 1,
      borderTopColor: theme.separator,
      paddingTop: 10,
      marginBottom: 4,
    },
    damageSummaryTitle: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
    damageSummaryTitleText: { ...typeScale.footnote, fontWeight: '700', color: theme.danger },
    damageSummaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.separator,
    },
    damageSummaryLabel: { ...typeScale.footnote, color: theme.textSecondary },
    viewFullButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 12,
      justifyContent: 'center',
      borderTopWidth: 1,
      borderTopColor: theme.separator,
      marginTop: 4,
    },
    viewFullText: { ...typeScale.subhead, fontWeight: '600', color: theme.accent },
    collapsedPhotoButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 10,
      paddingHorizontal: 14,
      justifyContent: 'center',
      borderTopWidth: 1,
      borderTopColor: theme.separator,
    },
    collapsedPhotoText: { ...typeScale.footnote, fontWeight: '600', color: theme.accent },
  });
}

function makeDetailStyles(theme: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    safeArea: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 14,
      backgroundColor: theme.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    headerTitle: { ...typeScale.title3, fontWeight: '700', color: theme.textPrimary },
    closeBtn: { padding: 4 },
    scrollContent: { padding: 16, paddingBottom: 40 },
    timestamp: { ...typeScale.caption, color: theme.textTertiary, marginBottom: 16 },
    answerCard: {
      backgroundColor: theme.surface,
      borderRadius: 10,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: theme.border,
    },
    answerCardLabel: {
      ...typeScale.footnote,
      fontWeight: '600',
      color: theme.textTertiary,
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    answerCardValue: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    answerValueText: { ...typeScale.callout, fontWeight: '600' },
    answerTextValue: { ...typeScale.subhead, color: theme.textPrimary, lineHeight: 22 },
    photoRow: { marginTop: 4 },
    photoThumb: {
      width: 100,
      height: 100,
      borderRadius: 8,
      marginRight: 8,
      overflow: 'hidden',
      backgroundColor: theme.background,
    },
    photoThumbImage: { width: '100%', height: '100%' },
    photoExpandIcon: {
      position: 'absolute',
      bottom: 6,
      right: 6,
      backgroundColor: theme.overlay,
      borderRadius: 4,
      padding: 3,
    },
    noPhotosText: { ...typeScale.footnote, color: theme.textTertiary, fontStyle: 'italic' },
  });
}

function makeDamageCardStyles(theme: ThemeColors) {
  return StyleSheet.create({
    container: {
      backgroundColor: theme.surface,
      borderRadius: 10,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: theme.danger + '40',
    },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
    title: { ...typeScale.subhead, fontWeight: '700', color: theme.danger },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.separator,
    },
    label: { ...typeScale.subhead, color: theme.textSecondary, fontWeight: "400" },
    notes: {
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: theme.separator,
    },
    notesLabel: {
      ...typeScale.caption2,
      fontWeight: '600',
      color: theme.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginBottom: 4,
    },
    notesText: { ...typeScale.subhead, color: theme.textPrimary },
    photosSection: {
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: theme.separator,
    },
    photosLabel: {
      ...typeScale.caption2,
      fontWeight: '600',
      color: theme.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginBottom: 8,
    },
    photoRow: { flexDirection: 'row' },
    photoThumb: {
      width: 100,
      height: 100,
      borderRadius: 8,
      marginRight: 8,
      overflow: 'hidden',
      backgroundColor: theme.background,
    },
    photoThumbImage: { width: '100%', height: '100%' },
    photoExpandIcon: {
      position: 'absolute',
      bottom: 6,
      right: 6,
      backgroundColor: theme.overlay,
      borderRadius: 4,
      padding: 3,
    },
  });
}

const severityBadge = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  text: { ...typeScale.caption, fontWeight: '600' },
});

const gallery = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: themes.dark.background,
    zIndex: 100,
  },
  container: { flex: 1, backgroundColor: themes.dark.background },
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
  headerTitle: { ...typeScale.subhead, fontWeight: '600' },
  headerSubtitle: { ...typeScale.caption, marginTop: 2 },
  listWrap: { flex: 1 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 16 },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: themes.dark.onAccent + "59",
  },
  dotActive: { width: 18 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { ...typeScale.callout, fontWeight: '600' },
  emptySubtext: { ...typeScale.footnote },
});
