import { useState, useEffect } from 'react';

interface Addon {
  id: number;
  name: string;
  slug: string;
  description: string;
  category: string;
  sedan_price: number;
  suv_price: number;
  commercial_price: number;
}

interface ServiceAddons {
  included: Addon[];
  available: Addon[];
}

type VehicleType = 'sedan' | 'suv' | 'commercial' | '';
type ServiceLevel = 'exterior' | 'interior' | 'deep-interior' | 'package-deal' | 'disaster' | '';

const services = [
  {
    id: 'exterior',
    name: 'Exterior Wash/Wax/Sealant',
    description: 'Hand wash, tire cleaning, windows, wax & sealant protection',
    prices: { sedan: 50, suv: 60, commercial: 80 },
    serviceId: 1
  },
  {
    id: 'interior',
    name: 'Interior Detail',
    description: 'Full vacuum, dashboard, door panels, glass cleaning',
    prices: { sedan: 120, suv: 160, commercial: 200 },
    serviceId: 2
  },
  {
    id: 'deep-interior',
    name: 'Interior DEEP Cleaning',
    description: 'Steam cleaning, stain extraction, headliner, vents, full sanitation',
    prices: { sedan: 200, suv: 240, commercial: 280 },
    serviceId: 3
  },
  {
    id: 'package-deal',
    name: 'Package Deal',
    description: 'Interior Detail + Full Exterior - Best Value!',
    prices: { sedan: 150, suv: 200, commercial: 250 },
    popular: true,
    serviceId: 4
  },
  {
    id: 'disaster',
    name: 'Disaster Vehicle',
    description: 'Deep Interior + Full Exterior + headlight restoration + ozone treatment',
    prices: { sedan: 230, suv: 270, commercial: 310 },
    serviceId: 5
  }
];

const vehicleLabels = {
  sedan: 'Sedan / Coupe',
  suv: 'SUV / Truck',
  commercial: 'Commercial'
};

export default function QuoteCalculator() {
  const [vehicleType, setVehicleType] = useState<VehicleType>('');
  const [serviceLevel, setServiceLevel] = useState<ServiceLevel>('');
  const [selectedAddons, setSelectedAddons] = useState<number[]>([]);
  const [availableAddons, setAvailableAddons] = useState<Addon[]>([]);
  const [includedAddons, setIncludedAddons] = useState<Addon[]>([]);
  const [estimate, setEstimate] = useState<number | null>(null);
  const [addonTotal, setAddonTotal] = useState(0);
  const [showAddons, setShowAddons] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Fetch addons when service is selected
  useEffect(() => {
    if (serviceLevel) {
      const service = services.find(s => s.id === serviceLevel);
      if (service) {
        fetchServiceAddons(service.serviceId);
      }
    }
  }, [serviceLevel]);

  // Calculate addon total when selections change
  useEffect(() => {
    if (vehicleType && selectedAddons.length > 0) {
      const total = availableAddons
        .filter(addon => selectedAddons.includes(addon.id))
        .reduce((sum, addon) => {
          const price = vehicleType === 'commercial' ? addon.commercial_price
            : vehicleType === 'suv' ? addon.suv_price : addon.sedan_price;
          return sum + parseFloat(String(price));
        }, 0);
      setAddonTotal(total);
    } else {
      setAddonTotal(0);
    }
  }, [selectedAddons, vehicleType, availableAddons]);

  const fetchServiceAddons = async (serviceId: number) => {
    try {
      const response = await fetch(
        `${import.meta.env.PUBLIC_API_URL || ''}/api/addons/services/${serviceId}/addons`
      );
      if (response.ok) {
        const data: ServiceAddons = await response.json();
        setIncludedAddons(data.included);
        setAvailableAddons(data.available);
        setSelectedAddons([]);
      }
    } catch (error) {
      console.error('Error fetching addons:', error);
      // Use empty arrays on error
      setIncludedAddons([]);
      setAvailableAddons([]);
    }
  };

  const calculateEstimate = () => {
    if (vehicleType && serviceLevel) {
      const service = services.find(s => s.id === serviceLevel);
      if (service) {
        const basePrice = service.prices[vehicleType];
        setEstimate(basePrice + addonTotal);
      }
    }
  };

  useEffect(() => {
    calculateEstimate();
  }, [vehicleType, serviceLevel, addonTotal]);

  const toggleAddon = (addonId: number) => {
    setSelectedAddons(prev =>
      prev.includes(addonId)
        ? prev.filter(id => id !== addonId)
        : [...prev, addonId]
    );
  };

  const getAddonPrice = (addon: Addon): number => {
    const price = !vehicleType ? addon.sedan_price
      : vehicleType === 'commercial' ? addon.commercial_price
      : vehicleType === 'suv' ? addon.suv_price : addon.sedan_price;
    return parseFloat(String(price));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch(`${import.meta.env.PUBLIC_API_URL || ''}/api/quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: formData.name,
          customerEmail: formData.email,
          customerPhone: formData.phone,
          vehicleType,
          serviceLevel,
          message: formData.message,
          selectedAddons: availableAddons.filter(a => selectedAddons.includes(a.id)).map(a => a.name),
          addonTotal,
          totalEstimate: estimate
        })
      });

      if (response.ok) {
        setSubmitted(true);
        setFormData({ name: '', email: '', phone: '', message: '' });
      }
    } catch (error) {
      console.error('Error submitting quote:', error);
      alert('Failed to submit quote request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-2xl font-bold text-gray-900 mb-2">Quote Request Sent!</h3>
        <p className="text-gray-600 mb-6">
          We'll get back to you shortly with a detailed quote. Please check your spam/junk folder if you don't see our email.
        </p>
        <button
          onClick={() => { setSubmitted(false); setShowContactForm(false); setEstimate(null); setShowAddons(false); setSelectedAddons([]); }}
          className="text-[#EB6C1D] hover:text-[#D35E14] font-medium"
        >
          Get Another Quote
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
      <div className="gradient-primary p-6 text-white">
        <h2 className="text-2xl font-bold mb-2">Get Instant Quote</h2>
        <p className="text-orange-100">Select your vehicle and service to see pricing</p>
      </div>

      <div className="p-6 space-y-6">
        {/* Question 1: Vehicle Type */}
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-3">
            1. What type of vehicle?
          </label>
          <div className="grid grid-cols-3 gap-3">
            {(['sedan', 'suv', 'commercial'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setVehicleType(type)}
                className={`p-4 rounded-lg border-2 transition-all ${
                  vehicleType === type
                    ? 'border-[#EB6C1D] bg-[#FEF4ED] text-[#9A4512]'
                    : 'border-gray-200 hover:border-gray-300 text-gray-700'
                }`}
              >
                <div className="text-center">
                  <div className="text-2xl mb-1">
                    {type === 'sedan' && '🚗'}
                    {type === 'suv' && '🚙'}
                    {type === 'commercial' && '🚐'}
                  </div>
                  <div className="text-xs font-medium">{vehicleLabels[type]}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Question 2: Service Level */}
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-3">
            2. What service do you need?
          </label>
          <div className="space-y-2">
            {services.map((service) => (
              <button
                key={service.id}
                onClick={() => { setServiceLevel(service.id as ServiceLevel); setShowAddons(false); }}
                className={`w-full p-4 rounded-lg border-2 transition-all text-left relative ${
                  serviceLevel === service.id
                    ? 'border-[#EB6C1D] bg-[#FEF4ED]'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {service.popular && (
                  <span className="absolute -top-2 right-3 bg-[#EB6C1D] text-white text-xs px-2 py-0.5 rounded-full">
                    Best Value
                  </span>
                )}
                <div className="flex items-center justify-between">
                  <div className="pr-4">
                    <div className="font-semibold text-gray-900">{service.name}</div>
                    <div className="text-sm text-gray-600">{service.description}</div>
                  </div>
                  {vehicleType && (
                    <div className="text-lg font-bold text-[#EB6C1D] whitespace-nowrap">
                      ${service.prices[vehicleType]}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Addons Section */}
        {serviceLevel && vehicleType && (
          <div className="pt-4 border-t border-gray-200">
            <button
              onClick={() => setShowAddons(!showAddons)}
              className="flex items-center justify-between w-full text-left"
            >
              <span className="text-sm font-semibold text-gray-900">
                3. Add Extra Services (Optional)
              </span>
              <svg
                className={`w-5 h-5 text-gray-500 transition-transform ${showAddons ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showAddons && (
              <div className="mt-4 space-y-4">
                {/* Included Addons */}
                {includedAddons.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-green-700 mb-2 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      Included in this service:
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {includedAddons.map(addon => (
                        <span
                          key={addon.id}
                          className="px-3 py-1 bg-green-50 text-green-700 text-sm rounded-full border border-green-200"
                        >
                          {addon.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Available Addons */}
                {availableAddons.length > 0 && (
                  <div className="space-y-2">
                    {availableAddons.map(addon => (
                      <label
                        key={addon.id}
                        className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                          selectedAddons.includes(addon.id)
                            ? 'border-[#EB6C1D] bg-[#FEF4ED]'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={selectedAddons.includes(addon.id)}
                            onChange={() => toggleAddon(addon.id)}
                            className="w-4 h-4 text-[#EB6C1D] border-gray-300 rounded focus:ring-[#EB6C1D]"
                          />
                          <div>
                            <div className="font-medium text-gray-900 text-sm">{addon.name}</div>
                            <div className="text-xs text-gray-500">{addon.description}</div>
                          </div>
                        </div>
                        <div className="text-sm font-semibold text-[#EB6C1D]">
                          +${getAddonPrice(addon)}
                        </div>
                      </label>
                    ))}
                  </div>
                )}

                {availableAddons.length === 0 && includedAddons.length === 0 && (
                  <p className="text-sm text-gray-500 italic">Loading addons...</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Estimate Display */}
        {estimate !== null && vehicleType && serviceLevel && (
          <div className="pt-6 border-t border-gray-200">
            <div className="bg-gradient-to-r from-[#FEF4ED] to-[#FDE8D9] rounded-xl p-6">
              <div className="text-center">
                <div className="text-sm text-gray-600 mb-2">Your Estimated Price</div>
                <div className="text-5xl font-bold text-gray-900 mb-2">
                  ${estimate}
                </div>
                {addonTotal > 0 && (
                  <div className="text-sm text-gray-600 mb-4">
                    (includes ${addonTotal} in add-ons)
                  </div>
                )}
                {!showContactForm && (
                  <button
                    onClick={() => setShowContactForm(true)}
                    className="px-8 py-3 bg-[#EB6C1D] text-white rounded-full hover:bg-[#D35E14] font-semibold transition-colors"
                  >
                    Request Detailed Quote
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Contact Form */}
        {showContactForm && (
          <form onSubmit={handleSubmit} className="space-y-4 pt-4 border-t border-gray-200">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Name
              </label>
              <input
                type="text"
                id="name"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#EB6C1D] focus:border-transparent"
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                id="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#EB6C1D] focus:border-transparent"
              />
            </div>
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                Phone
              </label>
              <input
                type="tel"
                id="phone"
                required
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#EB6C1D] focus:border-transparent"
              />
            </div>
            <div>
              <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">
                Additional Details (Optional)
              </label>
              <textarea
                id="message"
                rows={3}
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#EB6C1D] focus:border-transparent"
                placeholder="Vehicle condition, specific concerns, preferred date/time..."
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full px-8 py-3 bg-[#EB6C1D] text-white rounded-lg hover:bg-[#D35E14] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Sending...' : 'Submit Quote Request'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
