/**
 * The registry owns the dispose transition — the structural half of the
 * "at most one live upload service" invariant.
 *
 * BACKGROUND (observed on a real device, not hypothetical)
 * `SystemProvider` built its `BackendConnector` — and with it a Supabase client
 * and a `PhotoUploadService` — inside a `useMemo` keyed on Clerk's `getToken`,
 * which is a new closure on every render. Every render therefore installed a
 * new service while the previous one kept running: its pass loop re-arms a
 * timer for as long as anything is unresolved, so nothing about being replaced
 * ever stopped it. Each orphan added `MAX_CONCURRENT_UPLOADS` more upload lanes
 * and kept its whole retained graph alive, which is why RAM stayed elevated
 * long after every visible upload had finished.
 *
 * The provider-side fix (a stable token identity) removes the churn. This is
 * the other half: even if something re-installs, the previous instance is
 * retired as part of installing the replacement — by the registry, not by the
 * caller remembering to.
 */

import type { ForegroundRecovery } from "@/library/photoUploadQueue/runtime/foregroundRecovery";
import type { PhotoUploadService } from "@/library/photoUploadQueue/runtime/photoUploadService";
import {
  getPhotoUploadRecovery,
  getPhotoUploadService,
  setPhotoUploadRecovery,
  setPhotoUploadService,
} from "@/library/photoUploadQueue/runtime/serviceRegistry";

function createFakeService(): PhotoUploadService & { dispose: jest.Mock } {
  return {
    triggerFast: jest.fn(async () => {}),
    triggerBackoff: jest.fn(async () => {}),
    isRunning: false,
    countUnresolved: jest.fn(async () => 0),
    isRowInFlight: jest.fn(() => false),
    dispose: jest.fn(),
  };
}

function createFakeRecovery(): ForegroundRecovery & { dispose: jest.Mock } {
  return { run: jest.fn(), dispose: jest.fn() };
}

afterEach(() => {
  setPhotoUploadService(undefined);
  setPhotoUploadRecovery(undefined);
});

describe("setPhotoUploadService", () => {
  it("disposes the previous service when a new one is installed", () => {
    const a = createFakeService();
    const b = createFakeService();

    setPhotoUploadService(a);
    setPhotoUploadService(b);

    expect(a.dispose).toHaveBeenCalledTimes(1);
    expect(b.dispose).not.toHaveBeenCalled();
    expect(getPhotoUploadService()).toBe(b);
  });

  it("disposes the live service when the registry is cleared (provider unmount)", () => {
    const a = createFakeService();

    setPhotoUploadService(a);
    setPhotoUploadService(undefined);

    expect(a.dispose).toHaveBeenCalledTimes(1);
    expect(getPhotoUploadService()).toBeUndefined();
  });

  it("does not dispose an instance that is re-installed over itself", () => {
    const a = createFakeService();

    setPhotoUploadService(a);
    setPhotoUploadService(a);

    expect(a.dispose).not.toHaveBeenCalled();
    expect(getPhotoUploadService()).toBe(a);
  });
});

describe("setPhotoUploadRecovery", () => {
  it("disposes the previous recovery instance when a new one is installed", () => {
    const a = createFakeRecovery();
    const b = createFakeRecovery();

    setPhotoUploadRecovery(a);
    setPhotoUploadRecovery(b);

    expect(a.dispose).toHaveBeenCalledTimes(1);
    expect(b.dispose).not.toHaveBeenCalled();
    expect(getPhotoUploadRecovery()).toBe(b);
  });

  it("disposes the live recovery instance when the registry is cleared", () => {
    const a = createFakeRecovery();

    setPhotoUploadRecovery(a);
    setPhotoUploadRecovery(undefined);

    expect(a.dispose).toHaveBeenCalledTimes(1);
    expect(getPhotoUploadRecovery()).toBeUndefined();
  });
});
