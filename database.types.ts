export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      AccountManagers: {
        Row: {
          account_manager_id: number;
          created_at: string;
          is_active: boolean;
          user_id: number;
        };
        Insert: {
          account_manager_id?: number;
          created_at?: string;
          is_active?: boolean;
          user_id: number;
        };
        Update: {
          account_manager_id?: number;
          created_at?: string;
          is_active?: boolean;
          user_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "AccountManagers_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "Users";
            referencedColumns: ["user_id"];
          }
        ];
      };
      Addresses: {
        Row: {
          address_id: number;
          city: string;
          created_at: string;
          deleted: boolean | null;
          legend_state_uuid: string;
          state_province: string;
          street: string;
          updated_at: string | null;
          zip_postal: string | null;
        };
        Insert: {
          address_id?: number;
          city: string;
          created_at?: string;
          deleted?: boolean | null;
          legend_state_uuid?: string;
          state_province: string;
          street: string;
          updated_at?: string | null;
          zip_postal?: string | null;
        };
        Update: {
          address_id?: number;
          city?: string;
          created_at?: string;
          deleted?: boolean | null;
          legend_state_uuid?: string;
          state_province?: string;
          street?: string;
          updated_at?: string | null;
          zip_postal?: string | null;
        };
        Relationships: [];
      };
      BleacherEvents: {
        Row: {
          bleacher_event_id: number;
          bleacher_id: number;
          created_at: string;
          event_id: number;
          setup_confirmed: boolean;
          setup_text: string | null;
          teardown_confirmed: boolean;
          teardown_text: string | null;
        };
        Insert: {
          bleacher_event_id?: number;
          bleacher_id: number;
          created_at?: string;
          event_id: number;
          setup_confirmed?: boolean;
          setup_text?: string | null;
          teardown_confirmed?: boolean;
          teardown_text?: string | null;
        };
        Update: {
          bleacher_event_id?: number;
          bleacher_id?: number;
          created_at?: string;
          event_id?: number;
          setup_confirmed?: boolean;
          setup_text?: string | null;
          teardown_confirmed?: boolean;
          teardown_text?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "BleacherEvents_bleacher_id_fkey";
            columns: ["bleacher_id"];
            isOneToOne: false;
            referencedRelation: "Bleachers";
            referencedColumns: ["bleacher_id"];
          },
          {
            foreignKeyName: "BleacherEvents_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "Events";
            referencedColumns: ["event_id"];
          }
        ];
      };
      Bleachers: {
        Row: {
          bleacher_id: number;
          bleacher_number: number;
          bleacher_rows: number;
          bleacher_seats: number;
          created_at: string;
          created_by: string | null;
          deleted: boolean | null;
          home_base_id: number;
          legend_state_uuid: string;
          linxup_device_id: string | null;
          summer_account_manager_id: number | null;
          updated_at: string | null;
          updated_by: string | null;
          winter_account_manager_id: number | null;
          winter_home_base_id: number;
        };
        Insert: {
          bleacher_id?: number;
          bleacher_number: number;
          bleacher_rows: number;
          bleacher_seats: number;
          created_at?: string;
          created_by?: string | null;
          deleted?: boolean | null;
          home_base_id: number;
          legend_state_uuid?: string;
          linxup_device_id?: string | null;
          summer_account_manager_id?: number | null;
          updated_at?: string | null;
          updated_by?: string | null;
          winter_account_manager_id?: number | null;
          winter_home_base_id: number;
        };
        Update: {
          bleacher_id?: number;
          bleacher_number?: number;
          bleacher_rows?: number;
          bleacher_seats?: number;
          created_at?: string;
          created_by?: string | null;
          deleted?: boolean | null;
          home_base_id?: number;
          legend_state_uuid?: string;
          linxup_device_id?: string | null;
          summer_account_manager_id?: number | null;
          updated_at?: string | null;
          updated_by?: string | null;
          winter_account_manager_id?: number | null;
          winter_home_base_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "Bleachers_home_base_id_fkey";
            columns: ["home_base_id"];
            isOneToOne: false;
            referencedRelation: "HomeBases";
            referencedColumns: ["home_base_id"];
          },
          {
            foreignKeyName: "Bleachers_summer_account_manager_id_fkey";
            columns: ["summer_account_manager_id"];
            isOneToOne: false;
            referencedRelation: "AccountManagers";
            referencedColumns: ["account_manager_id"];
          },
          {
            foreignKeyName: "Bleachers_winter_account_manager_id_fkey";
            columns: ["winter_account_manager_id"];
            isOneToOne: false;
            referencedRelation: "AccountManagers";
            referencedColumns: ["account_manager_id"];
          },
          {
            foreignKeyName: "Bleachers_winter_home_base_id_fkey";
            columns: ["winter_home_base_id"];
            isOneToOne: false;
            referencedRelation: "HomeBases";
            referencedColumns: ["home_base_id"];
          }
        ];
      };
      BleacherUsers: {
        Row: {
          bleacher_id: number;
          bleacher_user_id: number;
          created_at: string;
          season: string;
          user_id: number;
        };
        Insert: {
          bleacher_id: number;
          bleacher_user_id?: number;
          created_at?: string;
          season: string;
          user_id: number;
        };
        Update: {
          bleacher_id?: number;
          bleacher_user_id?: number;
          created_at?: string;
          season?: string;
          user_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "BleacherUsers_bleacher_id_fkey";
            columns: ["bleacher_id"];
            isOneToOne: false;
            referencedRelation: "Bleachers";
            referencedColumns: ["bleacher_id"];
          },
          {
            foreignKeyName: "BleacherUsers_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "Users";
            referencedColumns: ["user_id"];
          }
        ];
      };
      Blocks: {
        Row: {
          bleacher_id: number | null;
          block_id: number;
          created_at: string;
          date: string | null;
          text: string | null;
        };
        Insert: {
          bleacher_id?: number | null;
          block_id?: number;
          created_at?: string;
          date?: string | null;
          text?: string | null;
        };
        Update: {
          bleacher_id?: number | null;
          block_id?: number;
          created_at?: string;
          date?: string | null;
          text?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "block_bleacher_id_fkey";
            columns: ["bleacher_id"];
            isOneToOne: false;
            referencedRelation: "Bleachers";
            referencedColumns: ["bleacher_id"];
          }
        ];
      };
      Drivers: {
        Row: {
          account_manager_id: number | null;
          address_id: number | null;
          created_at: string;
          deleted: boolean | null;
          driver_id: number;
          insurance_photo_path: string | null;
          is_active: boolean;
          legend_state_uuid: string;
          license_photo_path: string | null;
          medical_card_photo_path: string | null;
          pay_currency: string;
          pay_per_unit: string;
          pay_rate_cents: number;
          phone_number: string | null;
          tax: number;
          updated_at: string | null;
          user_id: number;
          vehicle_uuid: string | null;
        };
        Insert: {
          account_manager_id?: number | null;
          address_id?: number | null;
          created_at?: string;
          deleted?: boolean | null;
          driver_id?: number;
          insurance_photo_path?: string | null;
          is_active?: boolean;
          legend_state_uuid?: string;
          license_photo_path?: string | null;
          medical_card_photo_path?: string | null;
          pay_currency?: string;
          pay_per_unit?: string;
          pay_rate_cents?: number;
          phone_number?: string | null;
          tax?: number;
          updated_at?: string | null;
          user_id: number;
          vehicle_uuid?: string | null;
        };
        Update: {
          account_manager_id?: number | null;
          address_id?: number | null;
          created_at?: string;
          deleted?: boolean | null;
          driver_id?: number;
          insurance_photo_path?: string | null;
          is_active?: boolean;
          legend_state_uuid?: string;
          license_photo_path?: string | null;
          medical_card_photo_path?: string | null;
          pay_currency?: string;
          pay_per_unit?: string;
          pay_rate_cents?: number;
          phone_number?: string | null;
          tax?: number;
          updated_at?: string | null;
          user_id?: number;
          vehicle_uuid?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "Drivers_account_manager_id_fkey";
            columns: ["account_manager_id"];
            isOneToOne: false;
            referencedRelation: "AccountManagers";
            referencedColumns: ["account_manager_id"];
          },
          {
            foreignKeyName: "Drivers_address_id_fkey";
            columns: ["address_id"];
            isOneToOne: false;
            referencedRelation: "Addresses";
            referencedColumns: ["address_id"];
          },
          {
            foreignKeyName: "Drivers_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "Users";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "Drivers_vehicle_uuid_fkey";
            columns: ["vehicle_uuid"];
            isOneToOne: false;
            referencedRelation: "Vehicles";
            referencedColumns: ["vehicle_uuid"];
          }
        ];
      };
      Events: {
        Row: {
          address_id: number;
          booked: boolean;
          created_at: string;
          created_by_user_id: number | null;
          event_end: string;
          event_id: number;
          event_name: string;
          event_start: string;
          fifteen_row: number | null;
          goodshuffle_url: string | null;
          hsl_hue: number | null;
          lenient: boolean;
          must_be_clean: boolean;
          notes: string | null;
          setup_start: string | null;
          seven_row: number | null;
          teardown_end: string | null;
          ten_row: number | null;
          total_seats: number | null;
        };
        Insert: {
          address_id: number;
          booked?: boolean;
          created_at?: string;
          created_by_user_id?: number | null;
          event_end: string;
          event_id?: number;
          event_name: string;
          event_start: string;
          fifteen_row?: number | null;
          goodshuffle_url?: string | null;
          hsl_hue?: number | null;
          lenient: boolean;
          must_be_clean?: boolean;
          notes?: string | null;
          setup_start?: string | null;
          seven_row?: number | null;
          teardown_end?: string | null;
          ten_row?: number | null;
          total_seats?: number | null;
        };
        Update: {
          address_id?: number;
          booked?: boolean;
          created_at?: string;
          created_by_user_id?: number | null;
          event_end?: string;
          event_id?: number;
          event_name?: string;
          event_start?: string;
          fifteen_row?: number | null;
          goodshuffle_url?: string | null;
          hsl_hue?: number | null;
          lenient?: boolean;
          must_be_clean?: boolean;
          notes?: string | null;
          setup_start?: string | null;
          seven_row?: number | null;
          teardown_end?: string | null;
          ten_row?: number | null;
          total_seats?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "Events_address_id_fkey";
            columns: ["address_id"];
            isOneToOne: false;
            referencedRelation: "Addresses";
            referencedColumns: ["address_id"];
          },
          {
            foreignKeyName: "Events_created_by_user_id_fkey";
            columns: ["created_by_user_id"];
            isOneToOne: false;
            referencedRelation: "Users";
            referencedColumns: ["user_id"];
          }
        ];
      };
      HomeBases: {
        Row: {
          created_at: string;
          home_base_id: number;
          home_base_name: string;
        };
        Insert: {
          created_at?: string;
          home_base_id?: number;
          home_base_name: string;
        };
        Update: {
          created_at?: string;
          home_base_id?: number;
          home_base_name?: string;
        };
        Relationships: [];
      };
      InspectionPhotos: {
        Row: {
          created_at: string;
          deleted: boolean | null;
          inspection_photo_uuid: string;
          inspection_uuid: string;
          last_error: string | null;
          storage_path: string;
          updated_at: string | null;
          upload_status: string;
        };
        Insert: {
          created_at?: string;
          deleted?: boolean | null;
          inspection_photo_uuid?: string;
          inspection_uuid: string;
          last_error?: string | null;
          storage_path: string;
          updated_at?: string | null;
          upload_status?: string;
        };
        Update: {
          created_at?: string;
          deleted?: boolean | null;
          inspection_photo_uuid?: string;
          inspection_uuid?: string;
          last_error?: string | null;
          storage_path?: string;
          updated_at?: string | null;
          upload_status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "InspectionPhotos_inspection_uuid_fkey";
            columns: ["inspection_uuid"];
            isOneToOne: false;
            referencedRelation: "WorkTrackerInspections";
            referencedColumns: ["inspection_uuid"];
          }
        ];
      };
      Tasks: {
        Row: {
          created_at: string;
          created_by_user_id: number;
          description: string;
          name: string;
          task_id: number;
          task_status_id: number;
          task_type_id: number;
        };
        Insert: {
          created_at?: string;
          created_by_user_id: number;
          description: string;
          name: string;
          task_id?: number;
          task_status_id: number;
          task_type_id: number;
        };
        Update: {
          created_at?: string;
          created_by_user_id?: number;
          description?: string;
          name?: string;
          task_id?: number;
          task_status_id?: number;
          task_type_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "Tasks_created_by_user_id_fkey";
            columns: ["created_by_user_id"];
            isOneToOne: false;
            referencedRelation: "Users";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "Tasks_task_status_id_fkey";
            columns: ["task_status_id"];
            isOneToOne: false;
            referencedRelation: "TaskStatuses";
            referencedColumns: ["task_status_id"];
          },
          {
            foreignKeyName: "Tasks_task_type_id_fkey";
            columns: ["task_type_id"];
            isOneToOne: false;
            referencedRelation: "TaskTypes";
            referencedColumns: ["task_type_id"];
          }
        ];
      };
      TaskStatuses: {
        Row: {
          created_at: string;
          hex: string;
          label: string;
          task_status_id: number;
        };
        Insert: {
          created_at?: string;
          hex: string;
          label: string;
          task_status_id?: number;
        };
        Update: {
          created_at?: string;
          hex?: string;
          label?: string;
          task_status_id?: number;
        };
        Relationships: [];
      };
      TaskTypes: {
        Row: {
          created_at: string;
          label: string;
          task_type_id: number;
        };
        Insert: {
          created_at?: string;
          label: string;
          task_type_id?: number;
        };
        Update: {
          created_at?: string;
          label?: string;
          task_type_id?: number;
        };
        Relationships: [];
      };
      Todos: {
        Row: {
          created_at: string | null;
          deleted: boolean | null;
          done: boolean | null;
          legend_state_uuid: string;
          text: string | null;
          todo_id: number;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          deleted?: boolean | null;
          done?: boolean | null;
          legend_state_uuid?: string;
          text?: string | null;
          todo_id?: number;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          deleted?: boolean | null;
          done?: boolean | null;
          legend_state_uuid?: string;
          text?: string | null;
          todo_id?: number;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      UserHomeBases: {
        Row: {
          created_at: string;
          home_base_id: number | null;
          user_home_base_id: number;
          user_id: number | null;
        };
        Insert: {
          created_at?: string;
          home_base_id?: number | null;
          user_home_base_id?: number;
          user_id?: number | null;
        };
        Update: {
          created_at?: string;
          home_base_id?: number | null;
          user_home_base_id?: number;
          user_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "userhomebases_home_base_id_fkey";
            columns: ["home_base_id"];
            isOneToOne: false;
            referencedRelation: "HomeBases";
            referencedColumns: ["home_base_id"];
          },
          {
            foreignKeyName: "userhomebases_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "Users";
            referencedColumns: ["user_id"];
          }
        ];
      };
      UserRoles: {
        Row: {
          created_at: string;
          id: number;
          role: string;
        };
        Insert: {
          created_at?: string;
          id?: number;
          role: string;
        };
        Update: {
          created_at?: string;
          id?: number;
          role?: string;
        };
        Relationships: [];
      };
      Users: {
        Row: {
          avatar_image_url: string | null;
          clerk_user_id: string | null;
          created_at: string;
          deleted: boolean | null;
          email: string;
          first_name: string | null;
          is_admin: boolean;
          last_name: string | null;
          legend_state_uuid: string;
          phone: string | null;
          role: number | null;
          status: number;
          updated_at: string | null;
          user_id: number;
        };
        Insert: {
          avatar_image_url?: string | null;
          clerk_user_id?: string | null;
          created_at?: string;
          deleted?: boolean | null;
          email: string;
          first_name?: string | null;
          is_admin?: boolean;
          last_name?: string | null;
          legend_state_uuid?: string;
          phone?: string | null;
          role?: number | null;
          status?: number;
          updated_at?: string | null;
          user_id?: number;
        };
        Update: {
          avatar_image_url?: string | null;
          clerk_user_id?: string | null;
          created_at?: string;
          deleted?: boolean | null;
          email?: string;
          first_name?: string | null;
          is_admin?: boolean;
          last_name?: string | null;
          legend_state_uuid?: string;
          phone?: string | null;
          role?: number | null;
          status?: number;
          updated_at?: string | null;
          user_id?: number;
        };
        Relationships: [];
      };
      UserStatuses: {
        Row: {
          created_at: string;
          id: number;
          status: string;
        };
        Insert: {
          created_at?: string;
          id?: number;
          status: string;
        };
        Update: {
          created_at?: string;
          id?: number;
          status?: string;
        };
        Relationships: [];
      };
      Vehicles: {
        Row: {
          created_at: string;
          deleted: boolean | null;
          make: string;
          model: string;
          updated_at: string | null;
          vehicle_uuid: string;
          vin_number: string | null;
          year: number;
        };
        Insert: {
          created_at?: string;
          deleted?: boolean | null;
          make: string;
          model: string;
          updated_at?: string | null;
          vehicle_uuid?: string;
          vin_number?: string | null;
          year: number;
        };
        Update: {
          created_at?: string;
          deleted?: boolean | null;
          make?: string;
          model?: string;
          updated_at?: string | null;
          vehicle_uuid?: string;
          vin_number?: string | null;
          year?: number;
        };
        Relationships: [];
      };
      WorkTrackerInspections: {
        Row: {
          created_at: string;
          deleted: boolean | null;
          has_issues: boolean;
          inspection_uuid: string;
          notes: string | null;
          updated_at: string | null;
          walk_around_complete: boolean | null;
        };
        Insert: {
          created_at?: string;
          deleted?: boolean | null;
          has_issues: boolean;
          inspection_uuid?: string;
          notes?: string | null;
          updated_at?: string | null;
          walk_around_complete?: boolean | null;
        };
        Update: {
          created_at?: string;
          deleted?: boolean | null;
          has_issues?: boolean;
          inspection_uuid?: string;
          notes?: string | null;
          updated_at?: string | null;
          walk_around_complete?: boolean | null;
        };
        Relationships: [];
      };
      WorkTrackers: {
        Row: {
          accepted_at: string | null;
          bleacher_id: number | null;
          completed_at: string | null;
          created_at: string;
          date: string | null;
          deleted: boolean | null;
          driver_id: number | null;
          dropoff_address_id: number | null;
          dropoff_address_uuid: string | null;
          dropoff_poc: string | null;
          dropoff_time: string | null;
          internal_notes: string | null;
          legend_state_uuid: string;
          notes: string | null;
          pay_cents: number | null;
          pickup_address_id: number | null;
          pickup_address_uuid: string | null;
          pickup_poc: string | null;
          pickup_time: string | null;
          post_inspection_uuid: string | null;
          pre_inspection_uuid: string | null;
          released_at: string | null;
          started_at: string | null;
          status: Database["public"]["Enums"]["worktracker_status"];
          updated_at: string | null;
          user_id: number | null;
          work_tracker_id: number;
        };
        Insert: {
          accepted_at?: string | null;
          bleacher_id?: number | null;
          completed_at?: string | null;
          created_at?: string;
          date?: string | null;
          deleted?: boolean | null;
          driver_id?: number | null;
          dropoff_address_id?: number | null;
          dropoff_address_uuid?: string | null;
          dropoff_poc?: string | null;
          dropoff_time?: string | null;
          internal_notes?: string | null;
          legend_state_uuid?: string;
          notes?: string | null;
          pay_cents?: number | null;
          pickup_address_id?: number | null;
          pickup_address_uuid?: string | null;
          pickup_poc?: string | null;
          pickup_time?: string | null;
          post_inspection_uuid?: string | null;
          pre_inspection_uuid?: string | null;
          released_at?: string | null;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["worktracker_status"];
          updated_at?: string | null;
          user_id?: number | null;
          work_tracker_id?: number;
        };
        Update: {
          accepted_at?: string | null;
          bleacher_id?: number | null;
          completed_at?: string | null;
          created_at?: string;
          date?: string | null;
          deleted?: boolean | null;
          driver_id?: number | null;
          dropoff_address_id?: number | null;
          dropoff_address_uuid?: string | null;
          dropoff_poc?: string | null;
          dropoff_time?: string | null;
          internal_notes?: string | null;
          legend_state_uuid?: string;
          notes?: string | null;
          pay_cents?: number | null;
          pickup_address_id?: number | null;
          pickup_address_uuid?: string | null;
          pickup_poc?: string | null;
          pickup_time?: string | null;
          post_inspection_uuid?: string | null;
          pre_inspection_uuid?: string | null;
          released_at?: string | null;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["worktracker_status"];
          updated_at?: string | null;
          user_id?: number | null;
          work_tracker_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "worktrackers_bleacher_id_fkey";
            columns: ["bleacher_id"];
            isOneToOne: false;
            referencedRelation: "Bleachers";
            referencedColumns: ["bleacher_id"];
          },
          {
            foreignKeyName: "WorkTrackers_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: false;
            referencedRelation: "Drivers";
            referencedColumns: ["driver_id"];
          },
          {
            foreignKeyName: "worktrackers_dropoff_address_id_fkey";
            columns: ["dropoff_address_id"];
            isOneToOne: false;
            referencedRelation: "Addresses";
            referencedColumns: ["address_id"];
          },
          {
            foreignKeyName: "worktrackers_dropoff_address_uuid_fkey";
            columns: ["dropoff_address_uuid"];
            isOneToOne: false;
            referencedRelation: "Addresses";
            referencedColumns: ["legend_state_uuid"];
          },
          {
            foreignKeyName: "worktrackers_pickup_address_id_fkey";
            columns: ["pickup_address_id"];
            isOneToOne: false;
            referencedRelation: "Addresses";
            referencedColumns: ["address_id"];
          },
          {
            foreignKeyName: "worktrackers_pickup_address_uuid_fkey";
            columns: ["pickup_address_uuid"];
            isOneToOne: false;
            referencedRelation: "Addresses";
            referencedColumns: ["legend_state_uuid"];
          },
          {
            foreignKeyName: "WorkTrackers_post_inspection_uuid_fkey";
            columns: ["post_inspection_uuid"];
            isOneToOne: false;
            referencedRelation: "WorkTrackerInspections";
            referencedColumns: ["inspection_uuid"];
          },
          {
            foreignKeyName: "WorkTrackers_pre_inspection_uuid_fkey";
            columns: ["pre_inspection_uuid"];
            isOneToOne: false;
            referencedRelation: "WorkTrackerInspections";
            referencedColumns: ["inspection_uuid"];
          },
          {
            foreignKeyName: "worktrackers_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "Users";
            referencedColumns: ["user_id"];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      worktracker_status:
        | "draft"
        | "released"
        | "accepted"
        | "in_progress"
        | "completed"
        | "cancelled";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R;
    }
    ? R
    : never
  : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I;
    }
    ? I
    : never
  : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U;
    }
    ? U
    : never
  : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never;

export const Constants = {
  public: {
    Enums: {
      worktracker_status: [
        "draft",
        "released",
        "accepted",
        "in_progress",
        "completed",
        "cancelled",
      ],
    },
  },
} as const;
