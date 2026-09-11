'use client';

import { useCallback, useState } from 'react';
import axios from 'axios';
import { CustomerAddress } from '@/types/customers';
import { logClient } from '@/lib/logger/logger.client';
import { getApiError } from '@/lib/utils';

interface UseCustomerAddressesProps {
  token?: string;
}

export function useCustomerAddresses({ token }: UseCustomerAddressesProps) {
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<CustomerAddress | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const ADDRESSES_URL = '/api-proxy/api/Customers';

  const fetchAddresses = useCallback(async (cardCode: string) => {
    if (!token) return;

    setIsLoading(true);
    try {
      const res = await axios.get<CustomerAddress[]>(
        `${ADDRESSES_URL}/${cardCode}/addresses`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      setAddresses(res.data);
      if (res.data.length > 0) {
        setSelectedAddress(res.data[0]);
      } else {
        setSelectedAddress(null);
      }
    } catch (err: any) {
      logClient({
        level: 'ERROR',
        category: 'CLIENTES',
        endpoint: `${ADDRESSES_URL}/${cardCode}/addresses`,
        errorCode: err.response?.status,
        message: getApiError(err, 'Error al cargar direcciones'),
        responseBody: err.response?.data,
        pageUrl: '/dashboard/offers/',
      });
      setAddresses([]);
      setSelectedAddress(null);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  const clearAddresses = useCallback(() => {
    setAddresses([]);
    setSelectedAddress(null);
  }, []);

  return {
    addresses,
    selectedAddress,
    setSelectedAddress,
    isLoading,
    fetchAddresses,
    clearAddresses,
  };
}
