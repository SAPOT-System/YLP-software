import React from 'react';

const Modal = ({
	children,
	style=""
}: Readonly<{
	children?: React.ReactNode,
	style?: string
}>) => {
  return (
    <div className="fixed inset-0 bg-black/10 bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl w-full max-w-[700px] p-8 shadow-xl relative">
				{children}
			</div>
    </div>
  );
};

export default Modal;
