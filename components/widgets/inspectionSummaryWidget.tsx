import { inspectionPhotoAttachmentQueue } from '@/components/providers/SystemProvider';
import { InspectionData, parseInspectionAnswers } from '@/hooks/db/useInspection';
import { Ionicons } from '@expo/vector-icons';
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
  title: string;
  defaultExpanded?: boolean;
}

function getLocalUriForAttachment(storagePath: string): string | null {
  if (!storagePath || !inspectionPhotoAttachmentQueue) return null;
  const localPath = inspectionPhotoAttachmentQueue.getLocalFilePathSuffix(storagePath);
  return inspectionPhotoAttachmentQueue.getLocalUri(localPath);
}

// ─── Full-screen photo gallery modal ─────────────────────────────────────────

function PhotoGalleryModal({
  visible,
  photos,
  initialIndex,
  questionText,
  onClose,
}: {
  visible: boolean;
  photos: { storage_path: string }[];
  initialIndex: number;
  questionText: string;
  onClose: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  const uris = photos
    .map((p) => getLocalUriForAttachment(p.storage_path))
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
          <TouchableOpacity style={gallery.closeButton} onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
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
                  <Image
                    source={{ uri }}
                    style={gallery.image}
                    resizeMode="contain"
                  />
                </View>
              )}
            />

            {/* Dot indicators */}
            {uris.length > 1 && (
              <View style={gallery.dots}>
                {uris.map((_, i) => (
                  <View
                    key={i}
                    style={[gallery.dot, i === currentIndex && gallery.dotActive]}
                  />
                ))}
              </View>
            )}
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ─── Full inspection detail modal ────────────────────────────────────────────

export function InspectionDetailModal({
  visible,
  inspection,
  title,
  onClose,
}: {
  visible: boolean;
  inspection: InspectionData;
  title: string;
  onClose: () => void;
}) {
  const [galleryState, setGalleryState] = useState<{
    photos: { storage_path: string }[];
    questionText: string;
    initialIndex: number;
  } | null>(null);

  const answers = parseInspectionAnswers(inspection.answers_json);

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
            {/* Timestamp */}
            <Text style={detail.timestamp}>
              Completed: {formatDateTime(inspection.created_at)}
            </Text>

            {/* Walk-around */}
            <View style={detail.answerCard}>
              <Text style={detail.answerCardLabel}>Walk-around Inspection</Text>
              <View style={detail.answerCardValue}>
                {inspection.walk_around_complete ? (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#34C759" />
                    <Text style={[detail.answerValueText, { color: '#34C759' }]}>Complete</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="close-circle" size={20} color="#FF3B30" />
                    <Text style={[detail.answerValueText, { color: '#FF3B30' }]}>Not complete</Text>
                  </>
                )}
              </View>
            </View>

            {/* Dynamic answers */}
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
                          const uri = getLocalUriForAttachment(photo.storage_path);
                          return (
                            <TouchableOpacity
                              key={photoIndex}
                              style={detail.photoThumb}
                              onPress={() =>
                                setGalleryState({
                                  photos: answer.photos!,
                                  questionText: answer.question_text,
                                  initialIndex: photoIndex,
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
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Photo gallery — layered on top of detail modal */}
      {galleryState && (
        <PhotoGalleryModal
          visible={!!galleryState}
          photos={galleryState.photos}
          initialIndex={galleryState.initialIndex}
          questionText={galleryState.questionText}
          onClose={() => setGalleryState(null)}
        />
      )}
    </>
  );
}

// ─── Main widget ──────────────────────────────────────────────────────────────

export default function InspectionSummaryWidget({
  inspection,
  title,
  defaultExpanded = false,
}: InspectionSummaryWidgetProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [detailVisible, setDetailVisible] = useState(false);

  if (!inspection) return null;

  const answers = parseInspectionAnswers(inspection.answers_json);
  const photoAnswers = answers.filter(
    (a) => a.question_type === 'photo' && (a.photos?.length ?? 0) > 0
  );
  const totalPhotos = photoAnswers.reduce((sum, a) => sum + (a.photos?.length ?? 0), 0);

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
            {/* Walk-around row */}
            <View style={styles.answerRow}>
              <Text style={styles.answerLabel}>Walk-around complete</Text>
              <View style={styles.answerValue}>
                {inspection.walk_around_complete ? (
                  <>
                    <Ionicons name="checkmark-circle" size={16} color="#34C759" />
                    <Text style={[styles.answerValueText, { color: '#34C759' }]}>Yes</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="close-circle" size={16} color="#FF3B30" />
                    <Text style={[styles.answerValueText, { color: '#FF3B30' }]}>No</Text>
                  </>
                )}
              </View>
            </View>

            {/* Dynamic answers */}
            {answers.map((answer, index) => (
              <View
                key={index}
                style={[styles.answerRow, index === answers.length - 1 && !totalPhotos && styles.answerRowLast]}
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

            {/* View full inspection button — always shown when expanded */}
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

        {/* When collapsed, still show the view full button if photos exist (quick access) */}
        {!expanded && totalPhotos > 0 && (
          <TouchableOpacity
            style={styles.collapsedPhotoButton}
            onPress={() => setDetailVisible(true)}
          >
            <Ionicons name="images-outline" size={14} color="#0A84FF" />
            <Text style={styles.collapsedPhotoText}>
              View {totalPhotos} photo{totalPhotos !== 1 ? 's' : ''}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <InspectionDetailModal
        visible={detailVisible}
        inspection={inspection}
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
  body: { paddingHorizontal: 14, paddingBottom: 4, borderTopWidth: 1, borderTopColor: '#F2F2F7' },
  answerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F2F2F7' },
  answerRowLast: { borderBottomWidth: 0 },
  answerLabel: { fontSize: 13, color: '#3C3C3C', flex: 1, marginRight: 12 },
  answerValue: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  answerValueText: { fontSize: 13, fontWeight: '500', color: '#000' },
  photoPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EBF5FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  photoPillText: { fontSize: 11, fontWeight: '600', color: '#0A84FF' },
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