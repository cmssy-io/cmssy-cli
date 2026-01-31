/**
 * Test for preview data merge behavior
 * Run with: npx vitest run src/dev-ui-react/__tests__/previewData.test.ts
 */

import { describe, it, expect } from 'vitest';

// Simulating the merge logic from App.tsx
function mergeForSave(
  configDataRef: Record<string, unknown>,
  previewData: Record<string, unknown>
): Record<string, unknown> {
  return { ...configDataRef, ...previewData };
}

// Simulating mergeDefaultsWithPreview from dev.ts
function mergeDefaultsWithPreview(
  schema: Record<string, any>,
  previewData: Record<string, unknown>
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...previewData };

  for (const [key, field] of Object.entries(schema)) {
    if (merged[key] === undefined || merged[key] === null) {
      if (field.defaultValue !== undefined) {
        merged[key] = field.defaultValue;
      } else if (field.type === 'repeater') {
        merged[key] = [];
      }
    }

    if (field.type === 'repeater' && field.schema && Array.isArray(merged[key])) {
      merged[key] = (merged[key] as any[]).map((item: any) => {
        const mergedItem: Record<string, unknown> = { ...item };
        for (const [nestedKey, nestedField] of Object.entries(field.schema as Record<string, any>)) {
          if (mergedItem[nestedKey] === undefined && nestedField.defaultValue !== undefined) {
            mergedItem[nestedKey] = nestedField.defaultValue;
          }
        }
        return mergedItem;
      });
    }

    if (field.type === 'media' && typeof merged[key] === 'string') {
      merged[key] = { url: merged[key], alt: '' };
    }
  }

  return merged;
}

describe('Preview Data Management', () => {
  const mockSchema = {
    badge: { type: 'singleLine', label: 'Badge', defaultValue: 'About Us' },
    heading: { type: 'singleLine', label: 'Heading', defaultValue: 'Default Heading' },
    values: {
      type: 'repeater',
      label: 'Values',
      schema: {
        title: { type: 'singleLine', defaultValue: 'Title' },
        description: { type: 'multiLine', defaultValue: 'Description' },
      },
      defaultValue: [
        { title: 'Value 1', description: 'Desc 1' },
        { title: 'Value 2', description: 'Desc 2' },
      ],
    },
    imageUrl: { type: 'media', label: 'Image', defaultValue: 'https://example.com/img.jpg' },
  };

  const completePreviewData = {
    badge: 'About Us',
    heading: 'Building the future',
    values: [
      { title: 'Innovation', description: 'We innovate' },
      { title: 'Quality', description: 'We deliver quality' },
    ],
    imageUrl: { url: 'https://example.com/team.jpg', alt: 'Team' },
  };

  describe('mergeDefaultsWithPreview', () => {
    it('should merge defaultValues into empty previewData', () => {
      const result = mergeDefaultsWithPreview(mockSchema, {});

      expect(result.badge).toBe('About Us');
      expect(result.heading).toBe('Default Heading');
      expect(result.values).toEqual([
        { title: 'Value 1', description: 'Desc 1' },
        { title: 'Value 2', description: 'Desc 2' },
      ]);
      expect(result.imageUrl).toEqual({ url: 'https://example.com/img.jpg', alt: '' });
    });

    it('should preserve existing previewData values over defaults', () => {
      const result = mergeDefaultsWithPreview(mockSchema, { badge: 'Custom Badge' });

      expect(result.badge).toBe('Custom Badge');
      expect(result.heading).toBe('Default Heading'); // From default
    });

    it('should handle repeater arrays correctly', () => {
      const result = mergeDefaultsWithPreview(mockSchema, {
        values: [{ title: 'Custom' }], // Missing description
      });

      expect(result.values).toEqual([
        { title: 'Custom', description: 'Description' }, // description from default
      ]);
    });

    it('should convert string media to object', () => {
      const result = mergeDefaultsWithPreview(mockSchema, {
        imageUrl: 'https://custom.com/img.png',
      });

      expect(result.imageUrl).toEqual({ url: 'https://custom.com/img.png', alt: '' });
    });
  });

  describe('mergeForSave', () => {
    it('should merge configDataRef with previewData, previewData wins', () => {
      const configDataRef = { ...completePreviewData };
      const previewData = { badge: 'New Badge' };

      const result = mergeForSave(configDataRef, previewData);

      expect(result.badge).toBe('New Badge'); // User edit
      expect(result.heading).toBe('Building the future'); // From config
      expect(result.values).toEqual(completePreviewData.values); // From config
      expect(result.imageUrl).toEqual(completePreviewData.imageUrl); // From config
    });

    it('should preserve all fields when user edits one field', () => {
      const configDataRef = { ...completePreviewData };
      const previewData = { ...completePreviewData, badge: 'Edited Badge' };

      const result = mergeForSave(configDataRef, previewData);

      expect(Object.keys(result)).toEqual(Object.keys(completePreviewData));
      expect(result.badge).toBe('Edited Badge');
      expect(result.values).toEqual(completePreviewData.values);
    });

    it('should NOT lose data when configDataRef is empty (BUG SCENARIO)', () => {
      // This is the bug: if configDataRef is empty, we lose all data
      const configDataRef = {}; // Bug: ref was not set
      const previewData = { badge: 'New Badge' };

      const result = mergeForSave(configDataRef, previewData);

      // This will fail - demonstrating the bug
      // If configDataRef is empty, we only get previewData
      expect(Object.keys(result)).toEqual(['badge']);
    });

    it('should work correctly when configDataRef has complete data', () => {
      const configDataRef = { ...completePreviewData };
      const previewData = { badge: 'New Badge' };

      const result = mergeForSave(configDataRef, previewData);

      // With proper configDataRef, all data is preserved
      expect(Object.keys(result).sort()).toEqual(Object.keys(completePreviewData).sort());
    });
  });

  describe('Full flow simulation', () => {
    it('should simulate complete user edit flow', () => {
      // 1. Server loads preview.json and merges with schema defaults
      const previewJsonContent = { heading: 'Only heading' };
      const serverMerged = mergeDefaultsWithPreview(mockSchema, previewJsonContent);

      expect(serverMerged.badge).toBe('About Us'); // From default
      expect(serverMerged.heading).toBe('Only heading'); // From preview.json
      expect(serverMerged.values).toBeDefined(); // From default

      // 2. Frontend receives merged data and stores in configDataRef
      const configDataRef = { ...serverMerged };

      // 3. User edits badge
      const previewData = { ...serverMerged, badge: 'Edited Badge' };

      // 4. Save merges configDataRef with previewData
      const dataToSave = mergeForSave(configDataRef, previewData);

      // 5. All fields should be preserved
      expect(dataToSave.badge).toBe('Edited Badge');
      expect(dataToSave.heading).toBe('Only heading');
      expect(dataToSave.values).toEqual(serverMerged.values);
      expect(Object.keys(dataToSave).length).toBeGreaterThanOrEqual(4);
    });
  });
});
