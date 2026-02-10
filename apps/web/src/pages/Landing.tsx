import { Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { ArrowRight } from 'lucide-react';

export default function Landing() {
  const { isSignedIn } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">
            TaxAssist NG
          </h1>
          <p className="text-xl text-gray-700 mb-4">
            The simplest way for Nigerian freelancers and small businesses to
          </p>
          <p className="text-2xl font-semibold text-gray-900 mb-8">
            File your taxes in 15 minutes without needing an accountant.
          </p>

          <div className="grid md:grid-cols-3 gap-6 my-12">
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="font-semibold text-lg mb-2">Understand Taxes</h3>
              <p className="text-gray-600">
                Clear explanations of your tax obligations under the new Nigeria Tax Act
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="font-semibold text-lg mb-2">Calculate Accurately</h3>
              <p className="text-gray-600">
                Automatic tax calculations with all thresholds, exemptions, and reliefs
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="font-semibold text-lg mb-2">File Compliantly</h3>
              <p className="text-gray-600">
                Generate compliant tax returns and pay directly to NRS platforms
              </p>
            </div>
          </div>

          <div className="mt-12">
            {isSignedIn ? (
              <Link
                to="/app/dashboard"
                className="inline-flex items-center gap-2 bg-green-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors"
              >
                Go to Dashboard
                <ArrowRight className="w-5 h-5" />
              </Link>
            ) : (
              <div className="flex gap-4 justify-center">
                <Link
                  to="/sign-up"
                  className="inline-flex items-center gap-2 bg-green-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors"
                >
                  Get Started
                  <ArrowRight className="w-5 h-5" />
                </Link>
                <Link
                  to="/sign-in"
                  className="inline-flex items-center gap-2 bg-white text-green-600 px-8 py-3 rounded-lg font-semibold border-2 border-green-600 hover:bg-green-50 transition-colors"
                >
                  Sign In
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

