import { useEffect, useState } from 'react';
import BeforeAfterSliderClient from './BeforeAfterSliderClient';

interface GalleryPhoto {
  id: number;
  title: string;
  before_image_url: string;
  after_image_url: string;
  before_webp_url?: string;
  after_webp_url?: string;
  vehicle_type: string;
}

function toWebpUrl(url: string): string {
  return url.replace(/\.jpg$/i, '.webp');
}

const defaultFallbackPhotos: GalleryPhoto[] = [
  {
    id: 1,
    title: 'Car Seat Cleaning',
    before_image_url: '/images/gallery/seat-before.jpg',
    after_image_url: '/images/gallery/seat-after.jpg',
    before_webp_url: '/images/gallery/seat-before.webp',
    after_webp_url: '/images/gallery/seat-after.webp',
    vehicle_type: 'interior'
  },
  {
    id: 2,
    title: 'Gear Shifter Cleaning',
    before_image_url: '/images/gallery/shifter-before.jpg',
    after_image_url: '/images/gallery/shifter-after.jpg',
    before_webp_url: '/images/gallery/shifter-before.webp',
    after_webp_url: '/images/gallery/shifter-after.webp',
    vehicle_type: 'interior'
  },
  {
    id: 3,
    title: 'Car Seat Deep Clean',
    before_image_url: '/images/gallery/seat2-before.jpg',
    after_image_url: '/images/gallery/seat2-after.jpg',
    before_webp_url: '/images/gallery/seat2-before.webp',
    after_webp_url: '/images/gallery/seat2-after.webp',
    vehicle_type: 'interior'
  }
];

interface Props {
  fallbackPhotos?: GalleryPhoto[];
}

export default function GallerySectionClient({ fallbackPhotos = defaultFallbackPhotos }: Props) {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGallery = async () => {
      try {
        const apiUrl = import.meta.env.PUBLIC_API_URL || '';
        const response = await fetch(`${apiUrl}/api/gallery/featured`);
        if (!response.ok) throw new Error('API error');
        const data = await response.json();
        if (data.length > 0) {
          setPhotos(data.slice(0, 3)); // Show first 3 featured photos
        } else {
          setPhotos(fallbackPhotos);
        }
      } catch (error) {
        console.error('Error fetching gallery:', error);
        setPhotos(fallbackPhotos);
      } finally {
        setLoading(false);
      }
    };

    fetchGallery();
  }, [fallbackPhotos]);

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block w-8 h-8 border-4 border-[#EB6C1D] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
      {photos.map((photo) => (
        <div key={photo.id} className="space-y-2">
          <BeforeAfterSliderClient
            beforeImage={photo.before_image_url}
            afterImage={photo.after_image_url}
            beforeWebp={photo.before_webp_url || toWebpUrl(photo.before_image_url)}
            afterWebp={photo.after_webp_url || toWebpUrl(photo.after_image_url)}
            alt={photo.title}
          />
          <div className="text-center">
            <h3 className="font-semibold text-gray-900">{photo.title}</h3>
            <p className="text-sm text-gray-500 capitalize">{photo.vehicle_type}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
