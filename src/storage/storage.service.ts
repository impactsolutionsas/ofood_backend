import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

@Injectable()
export class StorageService {
  private supabase: SupabaseClient;
  private bucket = 'dishes';

  constructor(private config: ConfigService) {
    this.supabase = createClient(
      this.config.getOrThrow<string>('SUPABASE_URL'),
      this.config.getOrThrow<string>('SUPABASE_SERVICE_KEY'),
    );
  }

  async upload(
    file: Express.Multer.File,
    folder: string = 'dishes',
  ): Promise<string> {
    const ext = file.originalname.split('.').pop()?.toLowerCase();
    const allowed = ['jpg', 'jpeg', 'png', 'webp'];

    if (!ext || !allowed.includes(ext)) {
      throw new BadRequestException(
        'Format non supporté. Utilisez jpg, png ou webp.',
      );
    }

    const fileName = `${folder}/${randomUUID()}.${ext}`;

    const { error } = await this.supabase.storage
      .from(this.bucket)
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      throw new BadRequestException(`Erreur upload: ${error.message}`);
    }

    const {
      data: { publicUrl },
    } = this.supabase.storage.from(this.bucket).getPublicUrl(fileName);

    return publicUrl;
  }

  async delete(fileUrl: string): Promise<void> {
    const path = fileUrl.split(`/storage/v1/object/public/${this.bucket}/`)[1];
    if (path) {
      await this.supabase.storage.from(this.bucket).remove([path]);
    }
  }
}
