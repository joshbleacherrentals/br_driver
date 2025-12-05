export interface Driver {
  driver_id: number;
  created_at: string;
  user_id: number;
  tax: number;
  pay_rate_cents: number;
  pay_currency: "CAD" | "USD";
  pay_per_unit: "KM" | "MI" | "HR";
  account_manager_id: number | null;
  is_active: boolean;
  phone_number: string | null;
  address_id: number | null;
  license_photo_path: string | null;
  insurance_photo_path: string | null;
  medical_card_photo_path: string | null;
  vehicle_id: number | null;
}

export interface Vehicle {
  vehicle_id: number;
  created_at: string;
  make: string;
  model: string;
  year: number;
  vin_number: string | null;
}

export interface Address {
  address_id: number;
  created_at: string;
  street: string;
  city: string;
  state_province: string;
  zip_postal: string | null;
}

export interface DriverWithDetails extends Driver {
  vehicle?: Vehicle;
  address?: Address;
}
