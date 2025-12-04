export interface InspectionPhoto {
  photo_id: number;
  created_at: string;
  inspection_id: number;
  storage_path: string;
  caption: string | null;
}

export interface InspectionPhotoUpload {
  inspection_id: number;
  storage_path: string;
  caption?: string;
}
