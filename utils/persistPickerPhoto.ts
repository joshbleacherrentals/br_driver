import * as FileSystem from "expo-file-system/legacy";
import { randomUUID } from "expo-crypto";

const PERSIST_DIR = `${FileSystem.cacheDirectory}damage-photos/`;

export async function persistPickerPhoto(
  tempUri: string,
  ext: string,
): Promise<string> {
  await FileSystem.makeDirectoryAsync(PERSIST_DIR, { intermediates: true });
  const dest = `${PERSIST_DIR}${randomUUID()}.${ext}`;
  await FileSystem.copyAsync({ from: tempUri, to: dest });
  return dest;
}
