import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  findNodeHandle,
  InteractionManager,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
  type TextInput as TextInputType,
} from 'react-native';

type KeyboardAwareContextValue = {
  scrollToInput: (input: TextInputType | null) => void;
};

const KeyboardAwareContext = createContext<KeyboardAwareContextValue>({
  scrollToInput: () => undefined,
});

type Props = ScrollViewProps & {
  children: ReactNode;
  extraScrollHeight?: number;
  keyboardVerticalOffset?: number;
};

export function KeyboardAwareScreen({
  children,
  extraScrollHeight = Platform.OS === 'android' ? 112 : 88,
  keyboardVerticalOffset = 0,
  onScroll,
  scrollEventThrottle = 16,
  ...scrollProps
}: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const lastScrollEventRef = useRef<NativeSyntheticEvent<NativeScrollEvent> | null>(null);

  const scrollToInput = useCallback((input: TextInputType | null) => {
    if (!input) {
      return;
    }

    const inputHandle = findNodeHandle(input);
    const responder = scrollRef.current?.getScrollResponder?.();
    if (!inputHandle || !responder?.scrollResponderScrollNativeHandleToKeyboard) {
      return;
    }

    InteractionManager.runAfterInteractions(() => {
      responder.scrollResponderScrollNativeHandleToKeyboard(inputHandle, extraScrollHeight, true);
    });
  }, [extraScrollHeight]);

  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidShow', () => {
      const focusedInput = TextInput.State.currentlyFocusedInput?.() as TextInput | null | undefined;
      if (focusedInput) {
        scrollToInput(focusedInput);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [scrollToInput]);

  const contextValue = useMemo(() => ({ scrollToInput }), [scrollToInput]);

  return (
    <KeyboardAwareContext.Provider value={contextValue}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={keyboardVerticalOffset}
        style={{ flex: 1 }}
      >
        <ScrollView
          ref={scrollRef}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          overScrollMode="auto"
          scrollEventThrottle={scrollEventThrottle}
          showsVerticalScrollIndicator={false}
          onScroll={(event) => {
            lastScrollEventRef.current = event;
            onScroll?.(event);
          }}
          {...scrollProps}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </KeyboardAwareContext.Provider>
  );
}

export function useKeyboardAwareScroll() {
  return useContext(KeyboardAwareContext);
}
