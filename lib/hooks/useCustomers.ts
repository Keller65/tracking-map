'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { CustomerType, CustomerResponseType } from '@/types/customers';
import { logClient } from '@/lib/logger/logger.client';
import { getApiError } from '@/lib/utils';

interface UseCustomersProps {
  slpCode?: number;
  token?: string;
  pageSize?: number;
}

export function useCustomers({ slpCode, token, pageSize = 50 }: UseCustomersProps) {
  const [customers, setCustomers] = useState<CustomerType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [isLastPage, setIsLastPage] = useState(false);
  const [pendingCustomer, setPendingCustomer] = useState<CustomerType | null>(null);

  const searchRef = useRef(search);
  const isLastPageRef = useRef(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const CUSTOMERS_URL = '/api-proxy/api/Customers/by-sales-emp';

  const fetchCustomers = useCallback(async (pageToFetch = 1, isRefresh = false) => {
    if (!slpCode || !token) return;
    if (!isRefresh && isLastPageRef.current) return;

    const searchValue = searchRef.current;
    const searchParam = searchValue.trim() ? `&search=${encodeURIComponent(searchValue.trim())}` : '';
    const url = `${CUSTOMERS_URL}?slpCode&page=${pageToFetch}&pageSize=${pageSize}${searchParam}`;

    setIsLoading(true);
    try {
      const res = await axios.get<CustomerResponseType>(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      const newCustomers = res.data.items ?? [];

      if (isRefresh || pageToFetch === 1) {
        setCustomers(newCustomers);
        setPage(2);
      } else {
        setCustomers(prev => [...prev, ...newCustomers]);
        setPage(pageToFetch + 1);
      }

      const lastPage = newCustomers.length < pageSize;
      isLastPageRef.current = lastPage;
      setIsLastPage(lastPage);
    } catch (err: any) {
      logClient({
        level: 'ERROR',
        category: 'CLIENTES',
        endpoint: CUSTOMERS_URL,
        errorCode: err.response?.status,
        message: getApiError(err, 'Error al cargar clientes'),
        responseBody: err.response?.data,
        pageUrl: '/dashboard/offers/',
      });
    } finally {
      setIsLoading(false);
    }
  }, [slpCode, token, pageSize]);

  const resetAndFetch = useCallback(() => {
    setPage(1);
    isLastPageRef.current = false;
    setIsLastPage(false);
    fetchCustomers(1, true);
  }, [fetchCustomers]);

  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      resetAndFetch();
    }, 300);
    return () => clearTimeout(timer);
  }, [search, resetAndFetch]);

  const loadMoreRef = useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoading && !isLastPage) {
          fetchCustomers(page, false);
        }
      },
      { threshold: 0.1 }
    );

    if (node) observerRef.current.observe(node);
  }, [isLoading, isLastPage, page, fetchCustomers]);

  return {
    customers,
    isLoading,
    search,
    setSearch,
    pendingCustomer,
    setPendingCustomer,
    fetchCustomers,
    resetAndFetch,
    loadMoreRef,
  };
}
