import { StyleSheet } from 'react-native';

export const COLORS = {
  background: '#FFFFFF',
  primary: '#3B3BF9',
  text: '#111827',
  subtext: '#6B7280',
  border: '#E5E7EB',
  selectedBg: '#EDE9FE',
  selectedBorder: '#8B5CF6',
  selectedText: '#8B5CF6',
};

export const optionButtonStyles = StyleSheet.create({
  buttonBase: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    height: 52,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginBottom: 10,
  },
  buttonSelected: {
    backgroundColor: COLORS.selectedBg,
    borderColor: COLORS.selectedBorder,
  },
  textBase: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
  },
  textSelected: {
    color: COLORS.selectedText,
  },
});

export const layoutStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.subtext,
  },
  body: {
    flex: 1,
    paddingTop: 14,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  subLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.subtext,
    marginBottom: 10,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 14,
    backgroundColor: '#FFFFFF',
  },
  bottomArea: {
    paddingBottom: 20,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginTop: 10,
  },
  primaryButtonPressed: {
    opacity: 0.9,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryLink: {
    alignSelf: 'flex-end',
    paddingVertical: 10,
  },
  secondaryLinkText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.subtext,
  },
});

