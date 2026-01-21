import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Alert, Modal } from 'react-native';
import { db } from '@/components/providers/SystemProvider';
import { executeTypedMutation } from '@/library/powersync/typedMutation';

interface EditVehicleInfoProps {
  vehicleId: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  vinNumber: string | null;
  onClose: () => void;
}

export default function EditVehicleInfo({
  vehicleId,
  make,
  model,
  year,
  vinNumber,
  onClose,
}: EditVehicleInfoProps) {
  const [vehicleMake, setVehicleMake] = useState(make ?? '');
  const [vehicleModel, setVehicleModel] = useState(model ?? '');
  const [vehicleYear, setVehicleYear] = useState(year?.toString() ?? '');
  const [vehicleVin, setVehicleVin] = useState(vinNumber ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!vehicleId) {
      Alert.alert('Error', 'Vehicle ID not found');
      return;
    }

    // Validate year if provided
    const yearNum = vehicleYear ? parseInt(vehicleYear) : null;
    if (vehicleYear && (isNaN(yearNum!) || yearNum! < 1900 || yearNum! > new Date().getFullYear() + 1)) {
      Alert.alert('Invalid Year', 'Please enter a valid year');
      return;
    }

    setIsSubmitting(true);

    try {
      const updateQuery = db
        .updateTable('Vehicles')
        .set({
          make: vehicleMake.trim() || null,
          model: vehicleModel.trim() || null,
          year: yearNum,
          vin_number: vehicleVin.trim() || null,
        })
        .where('id', '=', vehicleId)
        .compile();

      await executeTypedMutation(updateQuery);

      Alert.alert('Success', 'Vehicle information updated successfully!', [
        { text: 'OK', onPress: onClose }
      ]);
    } catch (error) {
      console.error('Error updating vehicle:', error);
      Alert.alert('Error', 'Failed to update vehicle information. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={true}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.cancelButton}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Vehicle Info</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.section}>
            <Text style={styles.label}>Make</Text>
            <TextInput
              style={styles.input}
              value={vehicleMake}
              onChangeText={setVehicleMake}
              placeholder="e.g., Ford, Toyota, Chevrolet"
              placeholderTextColor="#8E8E93"
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Model</Text>
            <TextInput
              style={styles.input}
              value={vehicleModel}
              onChangeText={setVehicleModel}
              placeholder="e.g., F-150, Camry, Silverado"
              placeholderTextColor="#8E8E93"
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Year</Text>
            <TextInput
              style={styles.input}
              value={vehicleYear}
              onChangeText={setVehicleYear}
              placeholder="e.g., 2020"
              placeholderTextColor="#8E8E93"
              keyboardType="numeric"
              maxLength={4}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>VIN Number</Text>
            <TextInput
              style={styles.input}
              value={vehicleVin}
              onChangeText={setVehicleVin}
              placeholder="17-character VIN"
              placeholderTextColor="#8E8E93"
              autoCapitalize="characters"
              maxLength={17}
            />
          </View>

          <TouchableOpacity
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            <Text style={styles.submitButtonText}>
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  cancelButton: {
    fontSize: 16,
    color: '#0A84FF',
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  scrollContent: {
    padding: 16,
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F8F8F8',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#000',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  submitButton: {
    backgroundColor: '#34C759',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#A8E6B7',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});