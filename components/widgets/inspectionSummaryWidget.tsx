import {
  damageReportPhotoAttachmentQueue,
  inspectionPhotoAttachmentQueue,
} from '@/components/providers/SystemProvider';
import { DamageReportData } from '@/hooks/db/useDamageReport';
import { InspectionData, parseInspectionAnswers } from '@/hooks/db/useInspection';
import { Ionicons } from '@expo/vector-icons';
import { usePowerSyncQuery } from '@powersync/react-native';
import React, { useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Modal,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface InspectionSummaryWidgetProps {
  inspection: InspectionData | null;
  damages: DamageReportData[];
  title: string;
  defaultExpanded?: boolean;
}

// ─── URI resolvers ────────────────────────────────────────────────────────────

function getInspectionPhotoUri(storagePath: string): string | null {
  if (!storagePath || !inspectionPhotoAttachmentQueue) return null;
  const localPath = inspectionPhotoAttachmentQueue.getLocalFilePathSuffix(storagePath);
  return inspectionPhotoAttachmentQueue.getLocalUri(localPath);
}

function getDamagePhotoUri(storagePath: string): string | null {
  if (!storagePath || !damageReportPhotoAttachmentQueue) return null;
  const localPath = damageReportPhotoAttachmentQueue.getLocalFilePathSuffix(storagePath);
  return damageReportPhotoAttachmentQueue.getLocalUri(localPath);
}

// ─── Damage photo hook ────────────────────────────────────────────────────────

function useDamageReportPhotos(damageReportId: string | null): { storage_path: string }[] {
  const rows = usePowerSyncQuery<{ photo_path: string }>(
    `SELECT photo_path FROM "DamageReportPhotos" WHERE damage_report_uuid = ? AND photo_path IS NOT NULL`,
    damageReportId ? [damageReportId] : ['__none__']
  );
  return (rows ?? []).map((r) => ({ storage_path: r.photo_path }));
}

// ─── Severity helpers ─────────────────────────────────────────────────────────

function severityConfig(value: number | null): {
  label: string;
  color: string;
  bg: string;
  icon: 'checkmark-circle' | 'warning-outline' | 'warning';
} {
  if (value === 0) return { label: 'Minor', color: '#FF9500', bg: '#FFF3E0', icon: 'warning-outline' };
  if (value === 1) return { label: 'Major', color: '#FF3B30', bg: '#FFEBEA', icon: 'warning' };
  return { label: 'None', color: '#34C759', bg: '#E8F9ED', icon: 'checkmark-circle' };
}

function SeverityBadge({ value }: { value: number | null }) {
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
        <SeverityBadge value={damage.is_safe_to_sit} />
      </View>

      {/* Hauling configuration */}
      <View style={[damageCard.row, { borderBottomWidth: photos.length > 0 || !!damage.note ? 1 : 0 }]}>
        <Text style={damageCard.label}>Hauling Configuration</Text>
        <SeverityBadge value={damage.is_safe_to_haul} />
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
            {photos.map((photo, photoIndex) => {
              const uri = getDamagePhotoUri(photo.storage_path);
              return (
                <TouchableOpacity
                  key={photoIndex}
                  style={damageCard.photoThumb}
                  onPress={() => onPhotoPress(photos, photoIndex)}
                  activeOpacity={0.8}
                >
                  {uri ? (
                    <>
                      <Image
                        source={{ uri }}
                        style={damageCard.photoThumbImage}
                        resizeMode="cover"
                      />
                      <View style={damageCard.photoExpandIcon}>
                        <Ionicons name="expand-outline" size={14} color="#FFF" />
                      </View>
                    </>
                  ) : (
                    <View style={damageCard.photoThumbPlaceholder}>
                      <Ionicons name="cloud-download-outline" size={24} color="#8E8E93" />
                      <Text style={damageCard.photoThumbPlaceholderText}>Syncing...</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

// ─── Photo gallery modal ──────────────────────────────────────────────────────

function PhotoGalleryModal({
  visible,
  photos,
  initialIndex,
  questionText,
  resolveUri,
  onClose,
}: {
  visible: boolean;
  photos: { storage_path: string }[];
  initialIndex: number;
  questionText: string;
  resolveUri: (storagePath: string) => string | null;
  onClose: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  const uris = photos
    .map((p) => resolveUri(p.storage_path))
    .filter(Boolean) as string[];

  return (
    <Modal
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <SafeAreaView style={gallery.container}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />

        {/* Header */}
        <View style={gallery.header}>
          <TouchableOpacity
            style={gallery.closeButton}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={26} color="#FFF" />
          </TouchableOpacity>
          <View style={gallery.headerCenter}>
            <Text style={gallery.headerTitle} numberOfLines={1}>{questionText}</Text>
            <Text style={gallery.headerSubtitle}>
              {currentIndex + 1} / {uris.length}
            </Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {uris.length === 0 ? (
          <View style={gallery.emptyContainer}>
            <Ionicons name="image-outline" size={64} color="#555" />
            <Text style={gallery.emptyText}>Photos not yet downloaded</Text>
            <Text style={gallery.emptySubtext}>They will appear once synced</Text>
          </View>
        ) : (
          <>
            <FlatList
              data={uris}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={initialIndex}
              getItemLayout={(_, index) => ({
                length: SCREEN_WIDTH,
                offset: SCREEN_WIDTH * index,
                index,
              })}
              onMomentumScrollEnd={(e) => {
                const newIndex = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
                setCurrentIndex(newIndex);
              }}
              keyExtractor={(_, i) => String(i)}
              renderItem={({ item: uri }) => (
                <View style={gallery.imageContainer}>
                  <Image source={{ uri }} style={gallery.image} resizeMode="contain" />
                </View>
              )}
            />
            {uris.length > 1 && (
              <View style={gallery.dots}>
                {uris.map((_, i) => (
                  <View key={i} style={[gallery.dot, i === currentIndex && gallery.dotActive]} />
                ))}
              </View>
            )}
          </>
        )}
      </SafeAreaView>
    </Modal>
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

  return (
    <>
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={onClose}
      >
        <SafeAreaView style={detail.container}>
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
                        {answer.photos.map((photo, photoIndex) => {
                          const uri = getInspectionPhotoUri(photo.storage_path);
                          return (
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
                              {uri ? (
                                <>
                                  <Image
                                    source={{ uri }}
                                    style={detail.photoThumbImage}
                                    resizeMode="cover"
                                  />
                                  <View style={detail.photoExpandIcon}>
                                    <Ionicons name="expand-outline" size={14} color="#FFF" />
                                  </View>
                                </>
                              ) : (
                                <View style={detail.photoThumbPlaceholder}>
                                  <Ionicons name="cloud-download-outline" size={24} color="#8E8E93" />
                                  <Text style={detail.photoThumbPlaceholderText}>Syncing...</Text>
                                </View>
                              )}
                            </TouchableOpacity>
                          );
                        })}
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
      </Modal>

      {/* Gallery — uses the correct queue based on photo source */}
      {galleryState && (
        <PhotoGalleryModal
          visible={!!galleryState}
          photos={galleryState.photos}
          initialIndex={galleryState.initialIndex}
          questionText={galleryState.questionText}
          resolveUri={galleryState.isDamage ? getDamagePhotoUri : getInspectionPhotoUri}
          onClose={() => setGalleryState(null)}
        />
      )}
    </>
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
                  <SeverityBadge value={damage!.is_safe_to_sit} />
                </View>

                <View style={[styles.damageSummaryRow, { borderBottomWidth: 0 }]}>
                  <Text style={styles.damageSummaryLabel}>Hauling Config</Text>
                  <SeverityBadge value={damage!.is_safe_to_haul} />
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
  container: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  closeButton: { width: 40, alignItems: 'flex-start' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 15, fontWeight: '600', color: '#FFF' },
  headerSubtitle: { fontSize: 12, color: '#8E8E93', marginTop: 2 },
  imageContainer: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.75, justifyContent: 'center', alignItems: 'center' },
  image: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.75 },
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