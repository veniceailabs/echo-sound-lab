#pragma once

#include <cstddef>

#include <vector>
#include <cstring>

namespace EchoSoundLab::Utils {

/**
 * @brief Lock-free Circular Buffer
 * Used for low-latency audio buffering (no allocations during operation)
 */
template<typename T>
class CircularBuffer {
public:
  /**
   * @param capacity Maximum number of samples to store
   */
  explicit CircularBuffer(size_t capacity)
      : buffer_(capacity), capacity_(capacity), write_pos_(0), read_pos_(0) {}

  /**
   * @brief Write samples to buffer
   * @param samples Data to write
   * @param count Number of samples to write
   * @return Number of samples actually written
   */
  size_t Write(const T* samples, size_t count) {
    size_t written = 0;
    while (written < count && !IsFull()) {
      buffer_[write_pos_] = samples[written];
      write_pos_ = (write_pos_ + 1) % capacity_;
      written++;
    }
    return written;
  }

  /**
   * @brief Read samples from buffer
   * @param output Output buffer (must be large enough)
   * @param count Number of samples to read
   * @return Number of samples actually read
   */
  size_t Read(T* output, size_t count) {
    size_t read = 0;
    while (read < count && !IsEmpty()) {
      output[read] = buffer_[read_pos_];
      read_pos_ = (read_pos_ + 1) % capacity_;
      read++;
    }
    return read;
  }

  /**
   * @brief Peek at samples without consuming them
   */
  size_t Peek(T* output, size_t count) const {
    size_t peeked = 0;
    size_t pos = read_pos_;
    while (peeked < count && peeked < AvailableToRead()) {
      output[peeked] = buffer_[pos];
      pos = (pos + 1) % capacity_;
      peeked++;
    }
    return peeked;
  }

  /**
   * @brief Reset buffer (empty it)
   */
  void Clear() {
    write_pos_ = 0;
    read_pos_ = 0;
  }

  /**
   * @brief Number of samples available to read
   */
  size_t AvailableToRead() const {
    if (write_pos_ >= read_pos_) {
      return write_pos_ - read_pos_;
    }
    return capacity_ - read_pos_ + write_pos_;
  }

  /**
   * @brief Number of samples we can still write
   */
  size_t AvailableToWrite() const {
    return capacity_ - AvailableToRead();
  }

  /**
   * @brief Check if buffer is full
   */
  bool IsFull() const {
    return AvailableToRead() == capacity_;
  }

  /**
   * @brief Check if buffer is empty
   */
  bool IsEmpty() const {
    return write_pos_ == read_pos_;
  }

  /**
   * @brief Total capacity
   */
  size_t Capacity() const { return capacity_; }

private:
  std::vector<T> buffer_;
  size_t capacity_;
  size_t write_pos_;
  size_t read_pos_;
};

}  // namespace EchoSoundLab::Utils
