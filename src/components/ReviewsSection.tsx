import { useEffect, useState } from 'react';

interface LocalReview {
  id: number;
  customer_name: string;
  rating: number;
  review_text: string;
  created_at: string;
}

interface GoogleReview {
  author_name: string;
  author_photo_url: string | null;
  rating: number;
  text: string;
  relative_time: string;
  publish_time: string | null;
  google_maps_uri: string | null;
}

interface GoogleReviewsResponse {
  enabled: boolean;
  overall_rating?: number;
  total_reviews?: number;
  business_name?: string;
  reviews?: GoogleReview[];
  cached?: boolean;
  error?: string;
}

export default function ReviewsSection() {
  const [localReviews, setLocalReviews] = useState<LocalReview[]>([]);
  const [googleData, setGoogleData] = useState<GoogleReviewsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAllReviews = async () => {
      try {
        const apiUrl = import.meta.env.PUBLIC_API_URL || '';

        const [localRes, googleRes] = await Promise.all([
          fetch(`${apiUrl}/api/reviews`),
          fetch(`${apiUrl}/api/google-reviews`)
        ]);

        const localData = await localRes.json();
        const googleReviewData: GoogleReviewsResponse = await googleRes.json();

        setLocalReviews(localData.slice(0, 6));
        setGoogleData(googleReviewData);
      } catch (error) {
        console.error('Error fetching reviews:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAllReviews();
  }, []);

  const renderStars = (rating: number, size: 'sm' | 'md' | 'lg' = 'md') => {
    const sizeClasses = {
      sm: 'w-4 h-4',
      md: 'w-5 h-5',
      lg: 'w-6 h-6'
    };
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <svg
            key={star}
            className={`${sizeClasses[size]} ${star <= rating ? 'text-yellow-400' : 'text-gray-300'}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ))}
      </div>
    );
  };

  const GoogleIcon = () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block w-8 h-8 border-4 border-[#EB6C1D] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const hasGoogleReviews = googleData?.enabled && googleData.reviews && googleData.reviews.length > 0;
  const googleReviews = googleData?.reviews || [];

  return (
    <div>
      {/* Google Rating Overview */}
      {hasGoogleReviews && googleData.overall_rating && (
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-2 mb-3">
              <GoogleIcon />
              <span className="text-sm font-medium text-gray-600">Google Reviews</span>
            </div>
            <div className="text-5xl font-bold text-gray-900 mb-2">
              {googleData.overall_rating.toFixed(1)}
            </div>
            <div className="flex items-center justify-center gap-1 mb-2">
              {renderStars(Math.round(googleData.overall_rating), 'lg')}
            </div>
            <div className="text-gray-600">
              Based on {googleData.total_reviews} Google reviews
            </div>
          </div>
        </div>
      )}

      {/* Google Reviews Grid */}
      {hasGoogleReviews && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {googleReviews.slice(0, 6).map((review, index) => (
            <div key={index} className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow relative">
              <div className="absolute top-4 right-4">
                <GoogleIcon />
              </div>
              <div className="flex items-center gap-3 mb-4">
                {review.author_photo_url ? (
                  <img
                    src={review.author_photo_url}
                    alt={review.author_name}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-blue-600 font-semibold text-lg">
                      {review.author_name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div>
                  <div className="font-semibold text-gray-900">{review.author_name}</div>
                  <div className="text-xs text-gray-500">{review.relative_time}</div>
                </div>
              </div>
              <div className="mb-3">{renderStars(review.rating)}</div>
              <p className="text-gray-700 line-clamp-4">{review.text}</p>
              {review.google_maps_uri && (
                <a
                  href={review.google_maps_uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-3 text-sm text-blue-600 hover:underline"
                >
                  View on Google
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Local Reviews Section */}
      {localReviews.length > 0 && (
        <>
          {hasGoogleReviews && (
            <h3 className="text-xl font-semibold text-gray-900 mb-4">Customer Reviews</h3>
          )}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {localReviews.map((review) => (
              <div key={review.id} className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#FDE8D9] rounded-full flex items-center justify-center">
                      <span className="text-[#EB6C1D] font-semibold text-lg">
                        {review.customer_name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">{review.customer_name}</div>
                      <div className="text-xs text-gray-500">
                        {new Date(review.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mb-3">{renderStars(review.rating)}</div>
                <p className="text-gray-700">{review.review_text}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Empty State */}
      {!hasGoogleReviews && localReviews.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No reviews yet. Be the first to leave a review!
        </div>
      )}

      {/* Google Attribution Footer */}
      {hasGoogleReviews && (
        <div className="mt-6 text-center text-sm text-gray-500">
          Reviews powered by Google
        </div>
      )}
    </div>
  );
}
