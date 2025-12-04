# Debugging Supabase Storage for Inspection Photos

## Issues Fixed

1. ✅ Deprecated `ImagePicker.MediaTypeOptions` → Changed to `ImagePicker.MediaType.Images`
2. ✅ Added extensive console logging throughout the upload process

## Check Your Local Supabase Setup

### 1. Create the Storage Bucket

In Supabase Studio (http://127.0.0.1:54323):

1. Go to **Storage** section
2. Click **New bucket**
3. Name: `inspection-photos`
4. Set to **Public** (so you can view uploaded images)
5. Click **Create bucket**

### 2. Verify the InspectionPhotos Table

Run this in the SQL Editor:

```sql
SELECT * FROM public."InspectionPhotos";
```

Should show your table structure. If empty, that's normal until photos are uploaded.

### 3. Check Storage Policies

Run this to see if you have storage policies:

```sql
SELECT * FROM storage.policies WHERE bucket_id = 'inspection-photos';
```

If empty, create policies:

```sql
-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'inspection-photos');

-- Allow authenticated users to view photos
CREATE POLICY "Authenticated users can view photos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'inspection-photos');

-- Allow users to delete photos
CREATE POLICY "Users can delete photos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'inspection-photos');
```

### 4. Check RLS on InspectionPhotos Table

```sql
-- Check if RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'InspectionPhotos';

-- If rowsecurity is true, you need policies. Add these:
CREATE POLICY "Authenticated users can insert photos"
ON public."InspectionPhotos"
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can view photos"
ON public."InspectionPhotos"
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete photos"
ON public."InspectionPhotos"
FOR DELETE
TO authenticated
USING (true);
```

## Debugging with Console Logs

Now when you upload a photo, check your console for:

1. **InspectionPhotoUploader.tsx logs:**

   - "Photo selected: [uri]"
   - "Inspection ID: [id]"
   - "Uploading photo immediately..." or "Storing photo as pending..."
   - "Photo uploaded successfully: [photo object]"

2. **db/inspectionPhotos.ts logs:**
   - "uploadInspectionPhoto called: {inspectionId, fileUri, caption}"
   - "Generated storage path: [path]"
   - "File data size: [bytes] bytes"
   - "Storage upload result: {uploadData, uploadError}"
   - "Database insert result: {data, dbError}"
   - "Photo uploaded successfully: [photo object]"

## Common Issues

### Issue: "Bucket not found"

**Solution:** Create the `inspection-photos` bucket in Supabase Studio

### Issue: "new row violates row-level security policy"

**Solution:** Add RLS policies (see step 4 above) or disable RLS:

```sql
ALTER TABLE public."InspectionPhotos" DISABLE ROW LEVEL SECURITY;
```

### Issue: Photos upload but don't show in Storage

**Solution:** Check the Storage section in Supabase Studio:

- Go to Storage → inspection-photos → inspections/[inspection_id]/
- You should see your uploaded files there

### Issue: "Failed to save photo record"

**Solution:** Check the console logs for the exact database error. Common causes:

- Foreign key constraint (inspection_id doesn't exist in WorkTrackerInspections)
- RLS policy blocking insert
- Table doesn't exist

## Verify Upload Manually

After uploading a photo, check:

1. **Database record:**

```sql
SELECT * FROM public."InspectionPhotos" ORDER BY created_at DESC LIMIT 5;
```

2. **Storage files:**

```sql
SELECT * FROM storage.objects WHERE bucket_id = 'inspection-photos' ORDER BY created_at DESC LIMIT 5;
```

3. **In Supabase Studio:**
   - Storage → inspection-photos → Browse files
   - Should see folder structure: `inspections/[id]/[timestamp].jpg`

## Test the Connection

If you're using local Supabase, make sure your app is pointing to:

- API URL: `http://127.0.0.1:54321`
- Storage URL: `http://127.0.0.1:54321/storage/v1`

Check your environment variables or Supabase client configuration.
