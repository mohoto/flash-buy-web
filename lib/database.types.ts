export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
          position: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          position?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          position?: number
        }
        Relationships: []
      }
      design_images: {
        Row: {
          created_at: string
          design_id: string
          detail_path: string
          id: string
          position: number
          thumbnail_path: string
        }
        Insert: {
          created_at?: string
          design_id: string
          detail_path: string
          id?: string
          position?: number
          thumbnail_path: string
        }
        Update: {
          created_at?: string
          design_id?: string
          detail_path?: string
          id?: string
          position?: number
          thumbnail_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "design_images_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "product_designs"
            referencedColumns: ["id"]
          },
        ]
      }
      design_size_stock: {
        Row: {
          design_id: string
          id: string
          label: string
          stock: number
        }
        Insert: {
          design_id: string
          id?: string
          label: string
          stock?: number
        }
        Update: {
          design_id?: string
          id?: string
          label?: string
          stock?: number
        }
        Relationships: [
          {
            foreignKeyName: "design_size_stock_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "product_designs"
            referencedColumns: ["id"]
          },
        ]
      }
      device_push_tokens: {
        Row: {
          created_at: string
          expo_push_token: string
          id: string
          platform: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expo_push_token: string
          id?: string
          platform?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expo_push_token?: string
          id?: string
          platform?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      flash_sale_history: {
        Row: {
          created_at: string
          ended_at: string
          flash_price_cents: number
          id: string
          notified_1h_before_at: string | null
          notified_start_at: string | null
          pre_flash_price_cents: number | null
          product_id: string
          started_at: string
          status: string
        }
        Insert: {
          created_at?: string
          ended_at: string
          flash_price_cents: number
          id?: string
          notified_1h_before_at?: string | null
          notified_start_at?: string | null
          pre_flash_price_cents?: number | null
          product_id: string
          started_at: string
          status?: string
        }
        Update: {
          created_at?: string
          ended_at?: string
          flash_price_cents?: number
          id?: string
          notified_1h_before_at?: string | null
          notified_start_at?: string | null
          pre_flash_price_cents?: number | null
          product_id?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "flash_sale_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      flash_sale_notifications: {
        Row: {
          buyer_id: string
          created_at: string
          id: string
          minutes_before: number
          notified_before_at: string | null
          notified_start_at: string | null
          product_id: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          id?: string
          minutes_before: number
          notified_before_at?: string | null
          notified_start_at?: string | null
          product_id: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          id?: string
          minutes_before?: number
          notified_before_at?: string | null
          notified_start_at?: string | null
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flash_sale_notifications_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flash_sale_notifications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      live_order_items: {
        Row: {
          created_at: string
          design_size_stock_id: string | null
          id: string
          live_order_id: string
          match_score: number | null
          matched: boolean
          product_id: string | null
          quantity: number
          raw_product_text: string | null
          raw_size_text: string | null
          size_label: string | null
          source_comment: string | null
          tiktok_comment_id: string | null
          unit_price_cents: number
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          design_size_stock_id?: string | null
          id?: string
          live_order_id: string
          match_score?: number | null
          matched?: boolean
          product_id?: string | null
          quantity?: number
          raw_product_text?: string | null
          raw_size_text?: string | null
          size_label?: string | null
          source_comment?: string | null
          tiktok_comment_id?: string | null
          unit_price_cents?: number
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          design_size_stock_id?: string | null
          id?: string
          live_order_id?: string
          match_score?: number | null
          matched?: boolean
          product_id?: string | null
          quantity?: number
          raw_product_text?: string | null
          raw_size_text?: string | null
          size_label?: string | null
          source_comment?: string | null
          tiktok_comment_id?: string | null
          unit_price_cents?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_order_items_design_size_stock_id_fkey"
            columns: ["design_size_stock_id"]
            isOneToOne: false
            referencedRelation: "design_size_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_order_items_live_order_id_fkey"
            columns: ["live_order_id"]
            isOneToOne: false
            referencedRelation: "live_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      live_orders: {
        Row: {
          buyer_profile_id: string | null
          buyer_tiktok_username: string
          created_at: string
          id: string
          live_id: string | null
          shop_id: string
          status: Database["public"]["Enums"]["live_order_status"]
          stripe_payment_intent: string | null
          total_cents: number
          updated_at: string
        }
        Insert: {
          buyer_profile_id?: string | null
          buyer_tiktok_username: string
          created_at?: string
          id?: string
          live_id?: string | null
          shop_id: string
          status?: Database["public"]["Enums"]["live_order_status"]
          stripe_payment_intent?: string | null
          total_cents?: number
          updated_at?: string
        }
        Update: {
          buyer_profile_id?: string | null
          buyer_tiktok_username?: string
          created_at?: string
          id?: string
          live_id?: string | null
          shop_id?: string
          status?: Database["public"]["Enums"]["live_order_status"]
          stripe_payment_intent?: string | null
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_orders_buyer_profile_id_fkey"
            columns: ["buyer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_orders_live_id_fkey"
            columns: ["live_id"]
            isOneToOne: false
            referencedRelation: "lives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_orders_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      live_viewers: {
        Row: {
          id: string
          last_comment_at: string
          live_id: string
          nickname: string | null
          profile_picture_url: string | null
          tiktok_user_id: string
          tiktok_username: string
        }
        Insert: {
          id?: string
          last_comment_at?: string
          live_id: string
          nickname?: string | null
          profile_picture_url?: string | null
          tiktok_user_id: string
          tiktok_username: string
        }
        Update: {
          id?: string
          last_comment_at?: string
          live_id?: string
          nickname?: string | null
          profile_picture_url?: string | null
          tiktok_user_id?: string
          tiktok_username?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_viewers_live_id_fkey"
            columns: ["live_id"]
            isOneToOne: false
            referencedRelation: "lives"
            referencedColumns: ["id"]
          },
        ]
      }
      lives: {
        Row: {
          claimed_at: string | null
          created_at: string
          ended_at: string | null
          euler_alert_id: string | null
          heartbeat_at: string | null
          id: string
          sale_keywords: string[]
          shop_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["live_status"]
          tiktok_room_id: string | null
          tiktok_username: string | null
          viewer_count: number | null
          worker_id: string | null
        }
        Insert: {
          claimed_at?: string | null
          created_at?: string
          ended_at?: string | null
          euler_alert_id?: string | null
          heartbeat_at?: string | null
          id?: string
          sale_keywords?: string[]
          shop_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["live_status"]
          tiktok_room_id?: string | null
          tiktok_username?: string | null
          viewer_count?: number | null
          worker_id?: string | null
        }
        Update: {
          claimed_at?: string | null
          created_at?: string
          ended_at?: string | null
          euler_alert_id?: string | null
          heartbeat_at?: string | null
          id?: string
          sale_keywords?: string[]
          shop_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["live_status"]
          tiktok_room_id?: string | null
          tiktok_username?: string | null
          viewer_count?: number | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lives_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          design_size_stock_id: string | null
          id: string
          order_id: string
          product_id: string | null
          product_name_snapshot: string
          quantity: number
          unit_price_cents: number
          variant_id: string | null
          variant_label_snapshot: string | null
        }
        Insert: {
          created_at?: string
          design_size_stock_id?: string | null
          id?: string
          order_id: string
          product_id?: string | null
          product_name_snapshot: string
          quantity: number
          unit_price_cents: number
          variant_id?: string | null
          variant_label_snapshot?: string | null
        }
        Update: {
          created_at?: string
          design_size_stock_id?: string | null
          id?: string
          order_id?: string
          product_id?: string | null
          product_name_snapshot?: string
          quantity?: number
          unit_price_cents?: number
          variant_id?: string | null
          variant_label_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_design_size_stock_id_fkey"
            columns: ["design_size_stock_id"]
            isOneToOne: false
            referencedRelation: "design_size_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          buyer_id: string | null
          carrier: string | null
          created_at: string
          id: string
          label_url: string | null
          sendcloud_parcel_id: number | null
          service_point_address: string | null
          service_point_id: number | null
          service_point_name: string | null
          shipping_address: Json | null
          shipping_cost_cents: number | null
          shipping_method: string | null
          shipping_status: string | null
          shipping_weight_grams: number | null
          shop_id: string
          status: string
          total_cents: number
          tracking_number: string | null
          tracking_url: string | null
          updated_at: string
        }
        Insert: {
          buyer_id?: string | null
          carrier?: string | null
          created_at?: string
          id?: string
          label_url?: string | null
          sendcloud_parcel_id?: number | null
          service_point_address?: string | null
          service_point_id?: number | null
          service_point_name?: string | null
          shipping_address?: Json | null
          shipping_cost_cents?: number | null
          shipping_method?: string | null
          shipping_status?: string | null
          shipping_weight_grams?: number | null
          shop_id: string
          status?: string
          total_cents: number
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Update: {
          buyer_id?: string | null
          carrier?: string | null
          created_at?: string
          id?: string
          label_url?: string | null
          sendcloud_parcel_id?: number | null
          service_point_address?: string | null
          service_point_id?: number | null
          service_point_name?: string | null
          shipping_address?: Json | null
          shipping_cost_cents?: number | null
          shipping_method?: string | null
          shipping_status?: string | null
          shipping_weight_grams?: number | null
          shop_id?: string
          status?: string
          total_cents?: number
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      product_designs: {
        Row: {
          created_at: string
          id: string
          name: string
          position: number
          product_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          position?: number
          product_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          position?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_designs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          created_at: string
          detail_path: string
          id: string
          position: number
          product_id: string
          thumbnail_path: string
        }
        Insert: {
          created_at?: string
          detail_path: string
          id?: string
          position?: number
          product_id: string
          thumbnail_path: string
        }
        Update: {
          created_at?: string
          detail_path?: string
          id?: string
          position?: number
          product_id?: string
          thumbnail_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          created_at: string
          id: string
          label: string
          position: number
          product_id: string
          shop_id: string | null
          stock: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          position?: number
          product_id: string
          shop_id?: string | null
          stock?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          position?: number
          product_id?: string
          shop_id?: string | null
          stock?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          audience: string
          category: string | null
          created_at: string
          description: string | null
          flash_ends_at: string | null
          flash_started_at: string | null
          free_shipping: boolean
          id: string
          is_collection: boolean
          is_flash: boolean
          name: string
          original_price_cents: number | null
          pre_flash_price_cents: number | null
          price_cents: number
          shop_id: string
          sku: string | null
          status: string
          stock: number
          subcategory: string | null
          updated_at: string
          weight_grams: number | null
        }
        Insert: {
          audience?: string
          category?: string | null
          created_at?: string
          description?: string | null
          flash_ends_at?: string | null
          flash_started_at?: string | null
          free_shipping?: boolean
          id?: string
          is_collection?: boolean
          is_flash?: boolean
          name: string
          original_price_cents?: number | null
          pre_flash_price_cents?: number | null
          price_cents: number
          shop_id: string
          sku?: string | null
          status?: string
          stock?: number
          subcategory?: string | null
          updated_at?: string
          weight_grams?: number | null
        }
        Update: {
          audience?: string
          category?: string | null
          created_at?: string
          description?: string | null
          flash_ends_at?: string | null
          flash_started_at?: string | null
          free_shipping?: boolean
          id?: string
          is_collection?: boolean
          is_flash?: boolean
          name?: string
          original_price_cents?: number | null
          pre_flash_price_cents?: number | null
          price_cents?: number
          shop_id?: string
          sku?: string | null
          status?: string
          stock?: number
          subcategory?: string | null
          updated_at?: string
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          flassh_buy_enabled: boolean
          full_name: string | null
          id: string
          is_admin: boolean
          pseudo: string | null
          role: string
        }
        Insert: {
          created_at?: string
          flassh_buy_enabled?: boolean
          full_name?: string | null
          id: string
          is_admin?: boolean
          pseudo?: string | null
          role?: string
        }
        Update: {
          created_at?: string
          flassh_buy_enabled?: boolean
          full_name?: string | null
          id?: string
          is_admin?: boolean
          pseudo?: string | null
          role?: string
        }
        Relationships: []
      }
      railway_events: {
        Row: {
          environment: string | null
          event_type: string
          id: string
          payload: Json
          received_at: string
          service_name: string | null
          status: string | null
        }
        Insert: {
          environment?: string | null
          event_type: string
          id?: string
          payload: Json
          received_at?: string
          service_name?: string | null
          status?: string | null
        }
        Update: {
          environment?: string | null
          event_type?: string
          id?: string
          payload?: Json
          received_at?: string
          service_name?: string | null
          status?: string | null
        }
        Relationships: []
      }
      shop_follows: {
        Row: {
          buyer_id: string
          created_at: string
          id: string
          shop_id: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          id?: string
          shop_id: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          id?: string
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_follows_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_follows_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_reviews: {
        Row: {
          buyer_id: string
          comment: string | null
          created_at: string
          id: string
          rating: number
          shop_id: string
          updated_at: string
        }
        Insert: {
          buyer_id: string
          comment?: string | null
          created_at?: string
          id?: string
          rating: number
          shop_id: string
          updated_at?: string
        }
        Update: {
          buyer_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          rating?: number
          shop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_reviews_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_reviews_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shops: {
        Row: {
          address_line1: string | null
          cart_slug: string | null
          categories: string[]
          city: string | null
          contact_email: string | null
          contact_phone: string | null
          country: string | null
          created_at: string
          description: string | null
          id: string
          logo_url: string | null
          name: string
          owner_id: string
          postal_code: string | null
          siret: string | null
          tiktok_username: string | null
          updated_at: string
          verification_status: string
        }
        Insert: {
          address_line1?: string | null
          cart_slug?: string | null
          categories?: string[]
          city?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          owner_id: string
          postal_code?: string | null
          siret?: string | null
          tiktok_username?: string | null
          updated_at?: string
          verification_status?: string
        }
        Update: {
          address_line1?: string | null
          cart_slug?: string | null
          categories?: string[]
          city?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          owner_id?: string
          postal_code?: string | null
          siret?: string | null
          tiktok_username?: string | null
          updated_at?: string
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "shops_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subcategories: {
        Row: {
          category_id: string
          created_at: string
          id: string
          name: string
          position: number
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          name: string
          position?: number
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          name?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_health: {
        Row: {
          event_loop_p99_ms: number | null
          lives_count: number
          updated_at: string
          worker_id: string
          ws_open_failures: number
        }
        Insert: {
          event_loop_p99_ms?: number | null
          lives_count?: number
          updated_at?: string
          worker_id: string
          ws_open_failures?: number
        }
        Update: {
          event_loop_p99_ms?: number | null
          lives_count?: number
          updated_at?: string
          worker_id?: string
          ws_open_failures?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_stock: {
        Args: {
          p_id: string
          p_quantity: number
          p_shop_id: string
          p_target: string
        }
        Returns: Json
      }
      get_live_cart: {
        Args: { p_buyer: string; p_cart_slug: string }
        Returns: {
          item_id: string
          matched: boolean
          product_name: string
          quantity: number
          size_label: string
          unit_price_cents: number
        }[]
      }
      get_live_shop_by_slug: {
        Args: { p_cart_slug: string }
        Returns: {
          active_live_id: string
          shop_id: string
          shop_name: string
        }[]
      }
      is_flassh_buy_admin: { Args: never; Returns: boolean }
      is_pseudo_available: { Args: { check_pseudo: string }; Returns: boolean }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      upsert_device_push_token: {
        Args: { p_platform: string; p_token: string }
        Returns: undefined
      }
    }
    Enums: {
      live_order_status: "pending" | "validated" | "paid" | "cancelled"
      live_status: "scheduled" | "live" | "ended"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      live_order_status: ["pending", "validated", "paid", "cancelled"],
      live_status: ["scheduled", "live", "ended"],
    },
  },
} as const
