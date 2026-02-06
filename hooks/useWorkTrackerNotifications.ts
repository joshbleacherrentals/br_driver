import { useEffect, useRef, useMemo } from 'react';
import { fetchWorkTrackers } from '@/db/workTrackers';
import { scheduleTripNotification } from '@/services/notificationService';
import { useBatchBleachers } from '@/db/fetchBleacher';

export function useWorkTrackerNotifications() {
  const { workTrackers } = fetchWorkTrackers();
  const previousTrackersRef = useRef<any[]>([]);

  // ✅ Collect bleacher IDs safely
  const bleacherIds = useMemo(
    () => workTrackers?.map(wt => wt.bleacher_uuid ?? null) ?? [],
    [workTrackers]
  );

  // ✅ Hook-safe batched fetch
  const bleachersById = useBatchBleachers(bleacherIds);

  useEffect(() => {
    if (!workTrackers || workTrackers.length === 0) return;

    const previousTrackers = previousTrackersRef.current;

    workTrackers.forEach(tracker => {
      const bleacher = tracker.bleacher_uuid
        ? bleachersById[tracker.bleacher_uuid]
        : null;

      const previous = previousTrackers.find(p => p.id === tracker.id);

      if (previous && previous.status === 'draft' && tracker.status === 'released') {
        scheduleTripNotification(
          'New Trip Assigned',
          `Bleacher #${bleacher?.bleacher_number ?? ''} - Pickup on ${tracker.date}`,
          { workTrackerId: tracker.id, type: 'new_trip' }
        );
      } else if (previous && previous.notes !== tracker.notes && tracker.notes) {
        scheduleTripNotification(
          'Trip Notes Updated',
          `New notes for Bleacher #${bleacher?.bleacher_number ?? ''}`,
          { workTrackerId: tracker.id, type: 'notes_updated' }
        );
      } else if (previous && (
        (previous.pickup_time !== tracker.pickup_time && tracker.pickup_time) ||
        (previous.pickup_address_uuid !== tracker.pickup_address_uuid && tracker.pickup_address_uuid) ||
        (previous.pickup_poc !== tracker.pickup_poc && tracker.pickup_poc)
      )) {
        scheduleTripNotification(
          'Pickup Information Updated',
          `New pickup information for Bleacher #${bleacher?.bleacher_number ?? ''}`,
          { workTrackerId: tracker.id, type: 'pickup_info_updated' }
        );
      } else if (previous && (
        (previous.dropoff_time !== tracker.dropoff_time && tracker.dropoff_time) ||
        (previous.dropoff_address_uuid !== tracker.dropoff_address_uuid && tracker.dropoff_address_uuid) ||
        (previous.dropoff_poc !== tracker.dropoff_poc && tracker.dropoff_poc)
      )) {
        scheduleTripNotification(
          'Dropoff Information Updated',
          `New dropoff information for Bleacher #${bleacher?.bleacher_number ?? ''}`,
          { workTrackerId: tracker.id, type: 'dropoff_info_updated' }
        );
      }
    });

    previousTrackersRef.current = workTrackers;
  }, [workTrackers, bleachersById]);
}
