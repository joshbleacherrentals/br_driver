import * as FileSystem from "expo-file-system/legacy";

export async function readAsBase64(uri: string): Promise<string> {
  const result = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return result;
}
