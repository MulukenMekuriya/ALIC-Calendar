-- =====================================================
-- Create Storage Bucket for Expense Attachments
-- =====================================================

-- Create the bucket for expense attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'expense-attachments',
  'expense-attachments',
  false, -- Private bucket
  10485760, -- 10MB limit per file
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
) ON CONFLICT (id) DO NOTHING;

-- Policy: Allow authenticated users to upload files
CREATE POLICY "Users can upload expense attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'expense-attachments');

-- Policy: Allow users to view files they have access to (through expense requests they can see)
CREATE POLICY "Users can view expense attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'expense-attachments');

-- Policy: Allow users to delete their own uploaded files
CREATE POLICY "Users can delete their expense attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'expense-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy: Allow users to update their own files
CREATE POLICY "Users can update their expense attachments"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'expense-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
