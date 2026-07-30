/**
 * DEMO FACTORY - MINIMAL TEST VERSION
 */

import React from 'react';

export const DemoFactory: React.FC = () => {
  console.log('🎬 DemoFactory MINIMAL VERSION mounted');

  return (
    <div
      style={{
        position: 'fixed',
        top: '100px',
        right: '20px',
        width: '400px',
        padding: '30px',
        backgroundColor: '#ff0000',
        color: '#ffffff',
        fontSize: '24px',
        fontWeight: 'bold',
        zIndex: 99999,
        border: '5px solid #ffff00',
        borderRadius: '10px',
        textAlign: 'center'
      }}
    >
      🎬 DEMO FACTORY TEST - YOU SHOULD SEE THIS! 🎬
      <br />
      <br />
      <button
        onClick={() => alert('Button works!')}
        style={{
          padding: '15px 30px',
          fontSize: '18px',
          backgroundColor: '#00ff00',
          border: 'none',
          borderRadius: '5px',
          cursor: 'pointer',
          fontWeight: 'bold'
        }}
      >
        CLICK ME TO TEST
      </button>
    </div>
  );
};

export default DemoFactory;
