#include <string>

extern "C" int krnln_message_box(const char* text, const char* title) {
  (void)text;
  (void)title;
  return 0;
}
