package com.visitor.management.service;

import com.google.i18n.phonenumbers.NumberParseException;
import com.google.i18n.phonenumbers.PhoneNumberUtil;
import com.google.i18n.phonenumbers.Phonenumber;
import com.visitor.management.exception.BadRequestException;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class PhoneNumberService {

    private final PhoneNumberUtil phoneNumberUtil = PhoneNumberUtil.getInstance();

    public NormalizedPhone normalize(String countryCode, String phone, boolean required) {
        String number = trimToNull(phone);
        if (number == null) {
            if (required) {
                throw new BadRequestException("Phone number is required.");
            }
            return null;
        }

        String dialCode = normalizeDialCode(countryCode);
        String region = regionForDialCode(dialCode);
        try {
            Phonenumber.PhoneNumber parsed = number.startsWith("+")
                    ? phoneNumberUtil.parse(number, null)
                    : phoneNumberUtil.parse(number, region);
            if (!phoneNumberUtil.isValidNumber(parsed)) {
                throw new BadRequestException("Phone number is invalid for the selected country.");
            }
            String parsedDialCode = "+" + parsed.getCountryCode();
            if (dialCode != null && !dialCode.equals(parsedDialCode)) {
                throw new BadRequestException("Phone number does not match the selected country code.");
            }
            return new NormalizedPhone(parsedDialCode, phoneNumberUtil.format(parsed, PhoneNumberUtil.PhoneNumberFormat.E164));
        } catch (NumberParseException ex) {
            throw new BadRequestException("Phone number is invalid for the selected country.");
        }
    }

    public String normalizeDialCode(String countryCode) {
        String value = trimToNull(countryCode);
        if (value == null) {
            return null;
        }
        String normalized = value.startsWith("+") ? value : "+" + value;
        if (!normalized.matches("^\\+[1-9]\\d{0,3}$")) {
            throw new BadRequestException("Country dialing code is invalid.");
        }
        return normalized;
    }

    private String regionForDialCode(String dialCode) {
        if (dialCode == null) {
            return "US";
        }
        int numericCode = Integer.parseInt(dialCode.substring(1));
        List<String> regions = phoneNumberUtil.getRegionCodesForCountryCode(numericCode);
        if (regions == null || regions.isEmpty()) {
            throw new BadRequestException("Country dialing code is invalid.");
        }
        return regions.get(0);
    }

    private String trimToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    public record NormalizedPhone(String countryCode, String e164) {
    }
}
