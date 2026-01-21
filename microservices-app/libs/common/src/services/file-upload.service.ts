import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

@Injectable()
export class FileUploadService {
  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,  
    });
  }

  async uploadImage(file: Express.Multer.File): Promise<string> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          public_id: file.originalname,
          folder: 'products',
          resource_type: 'auto',
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else if (result?.secure_url) {
            resolve(result.secure_url);
          } else {
            reject(new Error('Upload failed: No secure URL returned'));
          }
        },
      );
      const readableStream = Readable.from(file.buffer);
      readableStream.pipe(stream);
    });
  }

  async uploadImages(files: Express.Multer.File[]): Promise<string[]> {
    const uploadPromises = files.map((file) => this.uploadImage(file));
    return Promise.all(uploadPromises);
  }
  async optimizeImage(publicId: string): Promise<string> {
    return cloudinary.url(publicId, {
      fetch_format: 'auto',
      quality: 'auto',
    });
  }

  async transformImage(publicId: string): Promise<string> {
    return cloudinary.url(publicId, {
      crop: 'auto',
      gravity: 'auto',
      width: 500,
      height: 500,
    });
  }
}
