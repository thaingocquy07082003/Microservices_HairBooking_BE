/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService implements OnModuleInit {
  private supabase: SupabaseClient;
  private adminClient: SupabaseClient;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const supabaseUrl = this.configService.getOrThrow<string>('SUPABASE_URL');
    const supabaseAnonKey = this.configService.getOrThrow<string>('SUPABASE_ANON_KEY');
    const supabaseServiceKey = this.configService.getOrThrow<string>('SUPABASE_SERVICE_KEY');

    // Client for regular operations
    this.supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Admin client for privileged operations
    this.adminClient = createClient(supabaseUrl, supabaseServiceKey);
  }

  getClient(): SupabaseClient {
    return this.supabase;
  }

  getAdminClient(): SupabaseClient {
    return this.adminClient;
  }

  // Auth Methods
  // Create user WITHOUT Supabase email confirmation (use custom OTP instead)
  async signUp(email: string, password: string, metadata?: any) {
    // Use admin API to create user without sending Supabase confirmation email
    const { data, error } = await this.adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: false, // Don't auto-confirm, we'll do it manually after OTP verification
      user_metadata: metadata,
    });

    if (error) throw error;
    return data;
  }

  async signInWithPassword(email: string, password: string) {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    return data;
  }

  async signOut(accessToken: string) {
    const { error } = await this.supabase.auth.signOut();
    if (error) throw error;
  }

  async getUser(accessToken: string) {
    const { data, error } = await this.supabase.auth.getUser(accessToken);
    if (error) throw error;
    return data.user; 
  }

  async updateUser(accessToken: string, updates: any) {
    const { data, error } = await this.supabase.auth.updateUser(updates);
    if (error) throw error;
    return data;
  }

  async resetPasswordForEmail(email: string) {
    const { data, error } = await this.supabase.auth.resetPasswordForEmail(
      email,
      {
        redirectTo: `${this.configService.get('APP_URL')}/reset-password`,
      },
    );

    if (error) throw error;
    return data;
  }

  async verifyOtp(email: string, token: string, type: 'signup' | 'email') {
    const { data, error } = await this.supabase.auth.verifyOtp({
      email,
      token,
      type,
    });

    if (error) throw error;
    return data;
  }

  async refreshSession(refreshToken: string) {
    const { data, error } = await this.supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error) throw error;
    return data;
  }

  async setSession(accessToken: string, refreshToken: string) {
    const { data, error } = await this.supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) throw error;
    return data;
  }

  // Admin Methods
  async createUser(email: string, password: string, metadata?: any) {
    const { data, error } = await this.adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: metadata,
    });

    if (error) throw error;
    return data;
  }

  async getUserById(userId: string) {
    const { data, error } = await this.adminClient.auth.admin.getUserById(userId);
    if (error) throw error;
    return data;
  }

  async updateUserById(userId: string, updates: any) {
    const { data, error } = await this.adminClient.auth.admin.updateUserById(
      userId,
      updates,
    );

    if (error) throw error;
    return data;
  }

  async deleteUser(userId: string) {
    const { error } = await this.adminClient.auth.admin.deleteUser(userId);
    if (error) throw error;
  }

  async listUsers(page: number = 1, perPage: number = 10) {
    const { data, error } = await this.adminClient.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) throw error;
    return data;
  }

  // Database Methods
  async insertRecord(table: string, record: any) {
    const { data, error } = await this.adminClient
      .from(table)
      .insert(record)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateRecord(table: string, id: string, updates: any) {
    const { data, error } = await this.adminClient
      .from(table)
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getRecord(table: string, id: string) {
    const { data, error } = await this.adminClient
      .from(table)
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  async queryRecords(table: string, query: any = {}) {
    let queryBuilder = this.adminClient.from(table).select('*');

    if (query.filters) {
      Object.entries(query.filters).forEach(([key, value]) => {
        queryBuilder = queryBuilder.eq(key, value);
      });
    }

    if (query.limit) {
      queryBuilder = queryBuilder.limit(query.limit);
    }

    if (query.offset) {
      queryBuilder = queryBuilder.range(query.offset, query.offset + (query.limit || 10) - 1);
    }

    const { data, error } = await queryBuilder;
    if (error) throw error;
    return data;
  }
}